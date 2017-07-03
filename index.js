'use strict';

var ArgumentParser = require('argparse').ArgumentParser;
var promisify = require("promisify-node");
var fs = require("fs");
var SolidityParser = require("solidity-parser");
const path = require('path');

var parser = new ArgumentParser({
	version: require('./package.json').version,
	addHelp:true,
	description: 'Solidify - expands imports of the solidity file and merges them all in a single file'
});

parser.addArgument(
	[ 'file' ],
	{
		help: 'Solidity file to parse for imports'
	}
);

parser.addArgument(
	[ '-i', '--include' ],
	{
		action: 'append',
		nargs: 1,
		metavar: 'DIR',
		help: 'Include directories. You can specify many'
	}
);

parser.addArgument(
	[ '-c', '--nocomment' ],
	{
		action: 'storeTrue',
		help: 'Do not insert comments for start and end of file import'
	}
);

var args = parser.parseArgs();
var file = path.resolve(args.file);

if(!fs.existsSync(file)){
	console.warn(`File ${file} does not exist!`);
	process.exit(1);
}

var files = {}

function getFileAbsolutePath(curpath, file){
	if(file.startsWith('.'))
		return path.resolve(path.dirname(curpath), file);

	for(var i=0; args.include && i<args.include.length; ++i){
		var inc = args.include[i][0];
		var pth = path.resolve(inc, file)
		if(fs.existsSync(pth))
			return pth;
	}
	
	throw new Error(`Could not find file ${file} included from ${curpath}`);
}

function parseFile(file, name){
	if(files[file])
		return;

	let info = {
		name: name,
		contents: fs.readFileSync(file, 'utf-8')
	};

	let structure = SolidityParser.parse(info.contents);
	info.deps = [];
	files[file] = info;

	for(var i=0; i<structure.body.length; ++i){
		var s = structure.body[i];
		if(s.type == 'PragmaStatement'){
			info.version = s.start_version.version;
			info.version_range = s.start_version.operator + s.start_version.version;
			info.version_place = [s.start, s.end];
		}else if(s.type == 'ImportStatement'){
			let abspath = getFileAbsolutePath(file, s.from);
			info.deps.push({
				name: s.from,
				path: abspath,
				place: [s.start, s.end]
			});
			
			parseFile(abspath, s.from);
		}
	}
}

function getAllVersionsAndRanges(files){
	let versions = {}, ranges = {};
	for(let f in files){
		versions[files[f].version] = true;
		ranges[files[f].version_range] = true;
	}
	return {versions: Object.keys(versions), ranges: Object.keys(ranges)};
}

function getCommonRange(files){
	var vi = getAllVersionsAndRanges(files);
	var semver = require('semver');
	var minVer = semver.minSatisfying(vi.versions, vi.ranges.join(' '));
	if(minVer)
		return '^' + minVer;
	throw new Error('Could not find minimum compatible compiler version!');	
}

function buildFile(file, files, top){
	var fi = files[file];
	if(fi.included)
		return '';

	fi.included = true;

	//replace pragma
	for(let i=0; i<fi.deps.length; ++i){
		let dep = fi.deps[i];
		dep.contents = buildFile(dep.path, files);
	}

	function insertHead(startOrEnd){
		if(!fi.name)
			return '';
		if(args.nocomment)
			return '';
		return `/*************************************************************************
 * import "${fi.name}" : ${startOrEnd}
 *************************************************************************/`;
	}

	var str = fi.contents, headInserted;
	for(let i=fi.deps.length-1; i>=0; --i){
		let dep = fi.deps[i];
		str = str.substr(0, dep.place[0]) + dep.contents + str.substr(dep.place[1]);
	}

	str = insertHead('start') + str.substr(0, fi.version_place[0]) + 
		(top ? `pragma solidity ${getCommonRange(files)};` : '') +
		str.substr(fi.version_place[1]) + insertHead('end');

	return str;
}

//try{
	parseFile(file);
	var sol = buildFile(file, files, true);
	sol = `/*************************************************************************
 * This contract has been merged with solidify
 * https://github.com/tiesnetwork/solidify
 *************************************************************************/
 
 ` + sol;

	console.log(sol);
//}catch(e){
//	console.error(e.message);
//}

