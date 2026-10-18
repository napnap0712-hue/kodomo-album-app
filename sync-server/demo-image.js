'use strict';
// ONLY the bytes of this built-in, synthetic SVG can be uploaded. No user-selected file.
const crypto=require('node:crypto');
const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#e6f7ff"/><circle cx="180" cy="100" r="61" fill="#ffdf75"/><circle cx="180" cy="100" r="38" fill="#ff9ab0"/><path d="M40 190 Q180 145 320 190" stroke="#4aa9ad" stroke-width="13" fill="none"/><text x="180" y="221" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#2c577b">DEMO IMAGE ONLY</text></svg>';
const BYTES=Buffer.from(SVG,'utf8');
const DIGEST=crypto.createHash('sha256').update(BYTES).digest('hex');
function validPayload(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length!==BYTES.length)return false;
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(DIGEST,'hex'));
}
module.exports={SVG,BYTES,DIGEST,validPayload};
