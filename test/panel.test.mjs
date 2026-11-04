import test from 'node:test';
import {scenario} from './panel.mjs';
for(const name of ['ask','signin-us','signin-za','undo','partial','reject','trust'])test(name,{concurrency:false},()=>scenario(name));
