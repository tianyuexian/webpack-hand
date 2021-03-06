# 1. Webpack流程概括
    初始化参数：从配置文件和 Shell 语句中读取与合并参数，得出最终的参数； 开始编译：用上一步得到的参数初始化 Compiler 对象，加载所有配置的插件，执行对象的 run 方法开始执行编译；
    确定入口：根据配置中的 entry 找出所有的入口文件；
    编译模块：从入口文件出发，调用所有配置的 Loader 对模块进行翻译，再找出该模块依赖的模块，再递归本步骤直到所有入口依赖的文件都经过了本步骤的处理；
    完成模块编译：在经过第4步使用 Loader 翻译完所有模块后，得到了每个模块被翻译后的最终内容以及它们之间的依赖关系；
    输出资源：根据入口和模块之间的依赖关系，组装成一个个包含多个模块的 Chunk，再把每个 Chunk 转换成一个单独的文件加入到输出列表，这步是可以修改输出内容的最后机会；
    输出完成：在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统。
# 2. 钩子
```
entryOption 读取配置文件
afterPlugins 加载所有的插件
run 开始执行编译流程
compile 开始编译
afterCompile 编译完成
emit 写入文件
done 完成整体流程
```
# 3. 编写示例项目
## 3.1 安装依赖模块
```
$ npm init -y
$ yarn add webpack webpack-cli html-webpack-plugin
```
## 3.2 编写webpack配置文件
webpack.config.js
```
const path = require('path');
module.exports = {
    mode: 'development',
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js'
    },
    module: {},
    plugins: []
}
```
## 3.3 源文件
src/index.js
```
let a1=require('./a1');
console.log(a1);
```
src/a1.js
```
let a2=require('./base/a2');
module.exports='a1'+a2;
```
src/base/a2.js
```
module.exports='a2';
```
产出bundle.js
```
(function (modules) {
  var installedModules = {};
  function __webpack_require__(moduleId) {
    if (installedModules[moduleId]) {
      return installedModules[moduleId].exports;
    }
    var module = installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {}
    };

    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
    module.l = true;
    return module.exports;
  }
  return __webpack_require__(__webpack_require__.s = "./src/index.js");
})
  ({

    "./src/a1.js":
      (function (module, exports, __webpack_require__) {
        eval("let a2 = __webpack_require__( \"./src/base/a2.js\");\r\nmodule.exports = 'a1' + a2;");
      }),
    "./src/base/a2.js":
      (function (module, exports) {
        eval("module.exports = 'a2';");
      }),

    "./src/index.js":
      (function (module, exports, __webpack_require__) {
        eval("let a1 = __webpack_require__(\"./src/a1.js\");\r\nconsole.log(a1);");
      })
  });
  ```
  # 4. 编写webpack
  ## 4.1 安装依赖包
  ```
  $ yarn add babel-types babel-generator babel-traverse
  ```
  ## 4.2 创建项目
  package.json
  ```
  {
  "name": "webpackhand",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "bin": {
    "webpackhand": "./bin/webpackhand.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
  ```
 ## 4.3 创建可执行文件
 bin\webpackhand.js
 ```
 #! /usr/bin/env node
const path = require('path');
const fs = require('fs');
const Compiler = require('../lib/Compiler');
//命令的当前工作目录
const root = process.cwd();
//匹配配置文件对象
let options = require(path.resolve('webpack.config.js'));
let compiler = new Compiler(options);
compiler.run();
 ```
 ## 4.4 创建Compiler对象
 ```
 const path = require('path');
const fs = require('fs');
const babylon = require('babylon');
const t = require('babel-types');
const generate = require('babel-generator').default;
const traverse = require('babel-traverse').default;
const ejs = require('ejs');

class Compiler {
    constructor(options) {
        this.options = options;
    }
    run() {
        let that = this;
        this.root = process.cwd();//获取当前的工作目录
        let { entry } = this.options;//获取入口文件路径
        this.entryId = null;//记录入口文件的ID
        this.modules = {};//记录模块ID和内容的对应关系，所有的ID都是相对于根目录的
        this.buildModule(path.resolve(this.root, entry), true);//从入口文件开始编译
        console.log(this.modules);
        this.emitFile();
    }
    emitFile() {
        let mainTemplate = fs.readFileSync(path.join(__dirname, 'main.ejs'), 'utf8');
        let { modules, entryId } = this;
        let main = ejs.compile(mainTemplate)({ entryId, modules });
        let { output: { path: dist, filename } } = this.options;
        fs.writeFileSync(path.join(dist, filename), main);
    }
    getSource(modulePath) {
        return fs.readFileSync(modulePath, 'utf8');
    }
    //解析模块和依赖的模块，路径是一个绝对路径
    buildModule(modulePath, isEntry) {
        let source = this.getSource(modulePath);//获取源代码
        let moduleId = './' + path.relative(this.root, modulePath);//生成相对于工作根目录的模块ID
        if (isEntry) {//如果是入口的话把ID赋给入口
            this.entryId = moduleId;
        }
        //获取AST的编译结果 依赖的模块 转换后的源代码
        let { dependencies, sourcecode } = this.parse(source, path.dirname(moduleId));
        this.modules[moduleId] = sourcecode;
        //递归解析依赖的模块
        dependencies.forEach(dependency => this.buildModule(path.join(this.root, dependency)));
    }
    //解析源代码  传入父路径
    parse(source, parentPath) {
        let that = this;
        const ast = babylon.parse(source);
        let dependencies = [];
        traverse(ast, {
            CallExpression(p) {
                if (p.node.callee.name == 'require') {
                    let node = p.node;
                    node.callee.name = '__webpack_require__';
                    let modName = node.arguments[0].value;
                    modName += (modName.lastIndexOf('.') > 0 ? '' : '.js');
                    let moduleId = './' + path.join(parentPath, modName);
                    dependencies.push(moduleId);
                    node.arguments = [t.stringLiteral(moduleId)];
                }
            }
        });
        let sourcecode = generate(ast).code;
        return { sourcecode, dependencies };
    }
}
module.exports = Compiler;
 ```
 ## 4.5 入口模板
 main.ejs
 ```
 (function (modules) {
    var installedModules = {};
    function __webpack_require__(moduleId) {
      if (installedModules[moduleId]) {
        return installedModules[moduleId].exports;
      }
      var module = installedModules[moduleId] = {
        i: moduleId,
        l: false,
        exports: {}
      };

      modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
      module.l = true;
      return module.exports;
    }
    return __webpack_require__(__webpack_require__.s = "<%-entryId%>");
  })
    ({
        <%
          for(let id in modules){
              let source = modules[id];%>
              "<%-id%>":
              (function (module, exports,__webpack_require__) {
                eval(`<%-source%>`);
              }),
           <%}
        %>
    });
 ```
 ## 4.6 产出文件
 ```
 (function (modules) {
    var installedModules = {};
    function __webpack_require__(moduleId) {
      if (installedModules[moduleId]) {
        return installedModules[moduleId].exports;
      }
      var module = installedModules[moduleId] = {
        i: moduleId,
        l: false,
        exports: {}
      };

      modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
      module.l = true;
      return module.exports;
    }
    return __webpack_require__(__webpack_require__.s = "./src\index.js");
  })
    ({

              "./src\index.js":
              (function (module, exports,__webpack_require__) {
                eval(`let a1 = __webpack_require__("./src\\a1.js");
console.log(a1);`);
              }),

              "./src\a1.js":
              (function (module, exports,__webpack_require__) {
                eval(`let a2 = __webpack_require__("./src\\base\\a2.js");
module.exports = 'a1' + a2;`);
              }),

              "./src\base\a2.js":
              (function (module, exports,__webpack_require__) {
                eval(`module.exports = 'a2';`);
              }),

    });
 ```
 # 5. 支持loader
 ## 5.1 Compiler
 ```
  getSource(modulePath) {
        let that = this;
        let source = fs.readFileSync(modulePath, 'utf8');
        let { module: { rules } } = this.options;
        for (let i = 0; i < rules.length; i++) {
            let rule = rules[i];
            if (rule.test.test(modulePath)) {
                let loaders = rule.use;
                let loaderIndex = loaders.length - 1;
                function iterateLoaders() {
                    let loaderName = loaders[loaderIndex--];
                    let loader = require(path.resolve(that.root, 'node_modules', loaderName));
                    source = loader(source);
                    if (loaderIndex >= 0) {
                        iterateLoaders();
                    }
                }
                iterateLoaders();
                break;
            }
        }
        return source;
    }
 ```
 ## 5.2 less-loader
 ```
 var less = require('less');
module.exports = function (source) {
    let css;
    less.render(source, (err, output) => {
        css = output.css;
    });
    return css.replace(/\n/g, '\\n', 'g');
}
 ```
 ## 5.3 style-loader
 ```
module.exports = function (source) {
    let str = `
      let style = document.createElement('style');
      style.innerHTML = ${JSON.stringify(source)};
      document.head.appendChild(style);
    `;
    return str;
}
 ```
 ## 5.4 index.js
 ```
 require('./index.less');
 ```
 # 6. 支持插件
 ## 6.1 webpack.config.js
 ```
 const path = require('path');

class EntryOptionWebpackPlugin {
    apply(compiler) {
        compiler.hooks.entryOption.tap('Plugin', (option) => {
            console.log('EntryOptionWebpackPlugin');
        });
    }
}

class AfterPlugins {
    apply(compiler) {
        compiler.hooks.afterPlugins.tap('Plugin', (option) => {
            console.log('AfterPlugins');
        });
    }
}


class RunPlugin {
    apply(compiler) {
        compiler.hooks.run.tap('Plugin', (option) => {
            console.log('RunPlugin');
        });
    }
}


class CompileWebpackPlugin {
    apply(compiler) {
        compiler.hooks.compile.tap('Plugin', (option) => {
            console.log('CompileWebpackPlugin');
        });
    }
}


class AfterCompileWebpackPlugin {
    apply(compiler) {
        compiler.hooks.afterCompile.tap('Plugin', (option) => {
            console.log('AfterCompileWebpackPlugin');
        });
    }
}
class EmitWebpackPlugin {
    apply(compiler) {
        compiler.hooks.emit.tap('Plugin', () => {
            console.log('EmitWebpackPlugin');
        });
    }
}
class DoneWebpackPlugin {
    apply(compiler) {
        compiler.hooks.done.tap('Plugin', (option) => {
            console.log('DoneWebpackPlugin');
        });
    }
}
module.exports = {
    mode: 'development',
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js'
    },
    module: {
        rules: [
            {
                test: /\.less$/,
                use: ['style-loader', 'less-loader']
            }
        ]
    },
    plugins: [
        new EntryOptionWebpackPlugin(),
        new AfterPlugins(),
        new RunPlugin(),
        new CompileWebpackPlugin(),
        new AfterCompileWebpackPlugin(),
        new EmitWebpackPlugin(),
        new DoneWebpackPlugin()
    ]
}
 ```
## 6.2 Compiler
```
const path = require('path');
const fs = require('fs');
const babylon = require('babylon');
const t = require('babel-types');
const generate = require('babel-generator').default;
const traverse = require('babel-traverse').default;
const ejs = require('ejs');
const { SyncHook } = require('tapable');

class Compiler {
    constructor(options) {
        this.options = options;
        this.hooks = {
            entryOption: new SyncHook(),
            afterPlugins: new SyncHook(),
            run: new SyncHook(),
            compile: new SyncHook(),
            afterCompile: new SyncHook(),
            emit: new SyncHook(["compiler"]),
            afterEmit: new SyncHook(),
            done: new SyncHook()
        }
        let plugins = options.plugins;
        if (plugins && plugins.length > 0) {
            plugins.forEach(plugin => plugin.apply(this));
        }
        this.hooks.afterPlugins.call();
    }
    run() {
        this.hooks.run.call(this);
        let that = this;
        this.root = process.cwd();//获取当前的工作目录
        let { entry } = this.options;//获取入口文件路径
        this.entryId = null;//记录入口文件的ID
        this.modules = {};//记录模块ID和内容的对应关系，所有的ID都是相对于根目录的
        this.hooks.compile.call();
        this.buildModule(path.resolve(this.root, entry), true);//从入口文件开始编译
        this.hooks.afterCompile.call();
        this.emitFile();
    }
    emitFile() {
        this.hooks.emit.call(this, this);
        let mainTemplate = fs.readFileSync(path.join(__dirname, 'main.ejs'), 'utf8');
        let { modules, entryId } = this;
        let main = ejs.compile(mainTemplate)({ entryId, modules });
        let { output: { path: dist, filename } } = this.options;
        fs.writeFileSync(path.join(dist, filename), main);
        this.hooks.afterEmit.call();
        this.hooks.done.call();
    }
}
module.exports = Compiler;
```
# 7.支持懒加载
Compiler
```
emitFile() {
        this.hooks.emit.call(this, this);
        let mainTemplate = fs.readFileSync(path.join(__dirname, 'main.ejs'), 'utf8');
        let { modules, entryId } = this;
        let main = ejs.compile(mainTemplate)({ entryId, modules });
        let { output: { path: dist, filename } } = this.options;
        fs.writeFileSync(path.join(dist, filename), main);
        Object.entries(this.chunks).forEach(([chunkIndex, chunk]) => {
            let chunkTemplate = fs.readFileSync(path.join(__dirname, 'chunk.ejs'), 'utf8');
            let chunkData = ejs.compile(chunkTemplate)({ chunkIndex, chunk });
            let { output: { path: dist, filename } } = this.options;
            fs.writeFileSync(path.join(dist, `${chunkIndex}.bundle.js`), chunkData);
        });
        this.hooks.afterEmit.call();
        this.hooks.done.call();
    }

    //解析模块和依赖的模块，路径是一个绝对路径
    buildModule(modulePath, isEntry, chunkIndex) {
        let source = this.getSource(modulePath);//获取源代码
        let moduleId = './' + path.relative(this.root, modulePath);//生成相对于工作根目录的模块ID
        if (isEntry) {//如果是入口的话把ID赋给入口
            this.entryId = moduleId;
        }
        //获取AST的编译结果 依赖的模块 转换后的源代码
        let { dependencies, sourcecode } = this.parse(source, path.dirname(moduleId));
        if (typeof chunkIndex != 'undefined') {
            let currentChunk = typeof this.chunks[chunkIndex] == 'undefined' ? {} : this.chunks[chunkIndex];
            currentChunk[moduleId] = sourcecode;
            this.chunks[chunkIndex] = currentChunk;
        } else {
            this.modules[moduleId] = sourcecode;
        }

        //递归解析依赖的模块
        dependencies.forEach(dependency => this.buildModule(path.join(this.root, dependency, chunkIndex)));
    }
    //解析源代码  传入父路径
    parse(source, parentPath) {
        let that = this;
        const ast = babylon.parse(source, {
            plugins: ['dynamicImport']
        });
        let dependencies = [];
        traverse(ast, {
            CallExpression(p) {
                if (p.node.callee.name == 'require') {
                    let node = p.node;
                    node.callee.name = '__webpack_require__';
                    let modName = node.arguments[0].value;
                    modName += (modName.lastIndexOf('.') > 0 ? '' : '.js');
                    let moduleId = './' + path.join(parentPath, modName);
                    dependencies.push(moduleId);
                    node.arguments = [t.stringLiteral(moduleId)];
                } else if (t.isImport(p.node.callee)) {
                    let node = p.node;
                    let modName = node.arguments[0].value;//取得模块名
                    modName += (modName.lastIndexOf('.') > 0 ? '' : '.js');
                    let moduleId = './' + path.join(parentPath, modName);
                    p.replaceWithSourceString(`__webpack_require__.e(${that.chunkIndex}).then(__webpack_require__.t.bind(null, "${moduleId}", 7))`);
                    that.buildModule(path.join(that.root, moduleId), false, that.chunkIndex++);
                }
            }
        });
        let sourcecode = generate(ast).code;
        return { sourcecode, dependencies };
    }
```
chunk.ejs
```
(window["webpackJsonp"] = window["webpackJsonp"] || []).push([[<%=chunkIndex%>],{
    <%
        for(let id in chunk){
            let source = chunk[id];%>
        /***/ "<%-id%>":
        /***/ function(module, exports,__webpack_require__) {

        eval(`<%-source%>`);

        /***/ },
        <%}%>
    }]);
```
index.js
```
let loadButton = document.querySelector('#loadButton');
loadButton.addEventListener('click', () => {
    import('./video').then(video => {
        console.log(video.default);
    });
});
```
video.js
```
module.exports = 'video';
```
