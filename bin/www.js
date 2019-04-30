#! /usr/bin/env node

let path = require('path');

// 引用了配置文件
let config = require(path.resolve('webpack.config.js'));

let Comipler = require('../lib/Comipler');

let compiler = new Comipler(config);
compiler.hooks.entryOption.call(compiler);
// 初始化编译对象

compiler.run(); // 开始编译