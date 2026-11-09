import test from 'node:test';
import {scenario} from './panel.mjs';
for(const name of ['ask','signin-us','signin-za','undo','partial','reject','trust','command','command-deny','plugins','offline','stale','cancel-review','index-context','search','rules','quote','smoke','expired'])test(name,{concurrency:false},()=>scenario(name));
