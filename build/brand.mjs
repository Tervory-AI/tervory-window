import {createRequire} from 'node:module';
const {createICO}=createRequire(import.meta.url)('png2icons');
// Reuse png2icons' bitmap conversion, then add the standard BMP container.
// A white letterbox preserves the supplied logo's proportions in Inno's tall slot.
export function wizardBitmap(logo,tall=false){
 const ico=createICO(logo,0,0,false);
 if(!ico)throw Error('Brand bitmap conversion failed');
 const count=ico.readUInt16LE(4);let dib;
 for(let i=0;i<count;i++){
  const entry=6+i*16,offset=ico.readUInt32LE(entry+12),size=ico.readUInt32LE(entry+8);
  if(ico[entry]===0)dib=ico.subarray(offset,offset+size);
 }
 if(!dib||dib.readUInt32LE(0)!==40||dib.readUInt16LE(14)!==32)throw Error('Unexpected icon bitmap');
 const width=256,height=tall?490:256,stride=width*3,offsetY=Math.floor((height-width)/2);
 const bmp=Buffer.alloc(54+stride*height,255);bmp.fill(0,0,54);bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(width,18);bmp.writeInt32LE(height,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(stride*height,34);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const from=40+(y*width+x)*4,to=54+(y+offsetY)*stride+x*3,alpha=dib[from+3]/255;
  for(let c=0;c<3;c++)bmp[to+c]=Math.round(dib[from+c]*alpha+255*(1-alpha));
 }
 return bmp;
}
