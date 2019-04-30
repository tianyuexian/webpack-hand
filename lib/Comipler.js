let path = require('path');
let fs = require('fs');
let babylon = require('babylon');
let traverse = require('@babel/traverse').default;
let generator = require('@babel/generator').default;
let t = require('@babel/types');
let ejs = require('ejs');
let {SyncHook} = require('tapable');
class Comipler {
  constructor(config) {
    this.config = config;
    // 我需要拿到当前执行的根目录 
    this.root = process.cwd(); // 运行webpack时所在的路径
    this.entryId; // 默认采用 webpack.config entry
    this.modules = {}; // 所有模块的依赖
    this.hooks = {
      entryOption: new SyncHook(['compiler']),
      run:new SyncHook(['compiler']),
      beforeCompile: new SyncHook(['compiler']),
      afterCompile: new SyncHook(['compiler']),
      emit: new SyncHook(['compiler']),
      afterEmit: new SyncHook(['compiler']),
      done: new SyncHook(['compiler']),
    }
    if(Array.isArray(config.plugins)){
      //你设置了plugins
      config.plugins.forEach(p=>{
        p.apply(this);
      })
    }
  }
  getResource(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    // 读取内容的时候 如果我们文件名匹配到了 需要用loader来处理我们的内容
    let rules = this.config.module.rules;
    for (let i = 0; i < rules.length; i++) {
      let {test,use} = rules[i];
      let len = use.length-1;
      if (test.test(filename)){ // 如果当前正则匹配到了
        function normalLoader() {
          let loader = require(use[len--]); // 引用这个loader
          content = loader(content); // 把内容传入到loader函数中，将结果返回作为新的内容
          if (len >= 0) { // 说明还有loader  需要取下一个loader
            normalLoader();// 就继续解析
          }
        }
        normalLoader()
      }
    }
    return content;
  }
  parse(content, parentPath) {
    // 把内容转化成ast 语法树 并且更改内容 require -> webpack_require ./a.js ./src/a.js  
    // 1) ast 解析的步骤 把代码变成 ast语法树 esprima  => babylon
    let ast = babylon.parse(content);
    let dependencies = [];
    // 2) 遍历树找到对应的节点 estraverse => @babel/traverse   acron
    traverse(ast, { // 遍历树
      CallExpression(p) {
        let node = p.node;
        if (node.callee.name === 'require') {
          // 2.5）更改节点 @babel/types  t
          node.callee.name = '__webpack_require__';
          let filename = node.arguments[0].value;
          filename = filename + (path.extname(filename) ? '' : '.js');
          filename = './' + path.join(parentPath, filename);
          dependencies.push(filename);
          node.arguments = [t.stringLiteral(filename)];
        }
      }
    });
    // 3) 重新生成树 escodegen => @babel/generator
    let r = generator(ast);
    return { sourceCode: r.code, dependencies };
  }
  buildModule(moduleName, isEntry) { // 当前编译模块的名字 是否是入口文件
    // 通过路径 获取文件的内容
    this.hooks.beforeCompile.call(this);
    let content = this.getResource(moduleName);
    // 获取两个路径的差
    let relativePath = './' + path.relative(this.root, moduleName); //./src/index.js
    if (isEntry) { // 保存主模块的名字
      this.entryId = relativePath;
    }
    // 需要将content内容转换成 __webpack_require__ AST 收集依赖
    // 解析内容的方法
    let { sourceCode, dependencies } = this.parse(content, path.dirname(relativePath)); // 找到当前模块的父路径

    this.modules[relativePath] = sourceCode;
    // 把模块添加后 如果当前模块引入了其他模块在递归进行加载
    dependencies.forEach(dep => { // dep 相对路径  // ./src/b.js
      this.buildModule(path.resolve(this.root, dep), false);
    })
  }
  emitFile() {
    // this.modules this.entryId 替换原有的模板 拼字符串
    // 1）需要找到模板 用ejs 来渲染
    let templateStr = this.getResource(path.resolve(__dirname, '../', 'template.js'));
    let r = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules
    });
    let outputPath = path.join(this.config.output.path, this.config.output.filename);
    // 记录当前最终生成的资源
    // this.assets[this.config.output.filename] = r;
    fs.writeFileSync(outputPath, r);
  }
  run() {
    // 1) 编译模块
    this.hooks.run.call(this);
    this.buildModule(path.join(this.root, this.config.entry), true); // 默认打包时 需要先打包入口文件
    // 2) 把实体文件打包出来
    this.hooks.afterCompile.call(this);
    this.hooks.emit.call(this);
    this.emitFile();
    this.hooks.afterEmit.call(this);
    this.hooks.done.call(this);
  }
}
module.exports = Comipler;