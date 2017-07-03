# solidify
An utility to merge hierarchy of many .sol files with imports into one

To verify contract code on [etherscan.io](https://etherscan.io/verifyContract) you need to join all your contract sources to a single file.
It is not that easy if you have a lot of imports. This utility takes one contract, follows all imports and merges all the files into the one.

Usage:

```
node index.js -i <inlude_directory> path_to_sol_file.sol > output.sol
```
