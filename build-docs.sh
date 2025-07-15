#!/bin/bash

node build/index.js internal-export-docs-json

cp ./filen-cli-docs.json ./filen-cli-docs/src/filen-cli-docs.json

cd ./filen-cli-docs
npm install
npm run build
cd ..

cp ./filen-cli-docs/dist/index.html ./filen-cli-docs.html
