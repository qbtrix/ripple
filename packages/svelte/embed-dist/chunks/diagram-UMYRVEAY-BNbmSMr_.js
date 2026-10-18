var v;import{p as P}from"./chunk-JWPE2WC7-BBvWj59Z.js";import{_ as f,O as B,R as z,d as E,l as $,b as F,a as A,p as W,q as _,g as M,s as N,M as L,P as O,y as Y}from"./mermaid.core-DfbsjEgB.js";import{p as I}from"./cynefin-EF2NZ3EQ-BQ2WkHff.js";var j=O.packet,C=(v=class{constructor(){this.packet=[],this.setAccTitle=F,this.getAccTitle=A,this.setDiagramTitle=W,this.getDiagramTitle=_,this.getAccDescription=M,this.setAccDescription=N}getConfig(){const t=B({...j,...L().packet});return t.showBits&&(t.paddingY+=10),t}getPacket(){return this.packet}pushWord(t){t.length>0&&this.packet.push(t)}clear(){Y(),this.packet=[]}},f(v,"PacketDB"),v),q=1e4,G=f((t,e)=>{P(t,e);let r=-1,s=[],i=1;const{bitsPerRow:l}=e.getConfig();for(let{start:a,end:o,bits:d,label:g}of t.blocks){if(a!==void 0&&o!==void 0&&o<a)throw new Error(`Packet block ${a} - ${o} is invalid. End must be greater than start.`);if(a??=r+1,a!==r+1)throw new Error(`Packet block ${a} - ${o??a} is not contiguous. It should start from ${r+1}.`);if(d===0)throw new Error(`Packet block ${a} is invalid. Cannot have a zero bit field.`);for(o??=a+(d??1)-1,d??=o-a+1,r=o,$.debug(`Packet block ${a} - ${r} with label ${g}`);s.length<=l+1&&e.getPacket().length<q;){const[c,p]=H({start:a,end:o,bits:d,label:g},i,l);if(s.push(c),c.end+1===i*l&&(e.pushWord(s),s=[],i++),!p)break;({start:a,end:o,bits:d,label:g}=p)}}e.pushWord(s)},"populate"),H=f((t,e,r)=>{if(t.start===void 0)throw new Error("start should have been set during first phase");if(t.end===void 0)throw new Error("end should have been set during first phase");if(t.start>t.end)throw new Error(`Block start ${t.start} is greater than block end ${t.end}.`);if(t.end+1<=e*r)return[t,void 0];const s=e*r-1,i=e*r;return[{start:t.start,end:s,label:t.label,bits:s-t.start},{start:i,end:t.end,label:t.label,bits:t.end-i}]},"getNextFittingBlock"),S={parser:{yy:void 0},parse:f(async t=>{const e=await I("packet",t),r=S.parser?.yy;if(!(r instanceof C))throw new Error("parser.parser?.yy was not a PacketDB. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.");$.debug(e),G(e,r)},"parse")},K=f((t,e,r,s)=>{const i=s.db,l=i.getConfig(),{rowHeight:a,paddingY:o,bitWidth:d,bitsPerRow:g}=l,c=i.getPacket(),p=i.getDiagramTitle(),b=a+o,n=b*(c.length+1)-(p?0:a),h=d*g+2,k=z(e);k.attr("viewBox",`0 0 ${h} ${n}`),E(k,n,h,l.useMaxWidth);for(const[x,u]of c.entries())R(k,u,x,l);k.append("text").text(p).attr("x",h/2).attr("y",n-b/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),R=f((t,e,r,{rowHeight:s,paddingX:i,paddingY:l,bitWidth:a,bitsPerRow:o,showBits:d,bitOrder:g})=>{const c=t.append("g"),p=r*(s+l)+l,b=g==="descending";for(const n of e){const h=n.end-n.start+1,k=n.start%o,u=(b?o-k-h:k)*a+1,m=h*a-i;if(c.append("rect").attr("x",u).attr("y",p).attr("width",m).attr("height",s).attr("class","packetBlock"),c.append("text").attr("x",u+m/2).attr("y",p+s/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(n.label),!d)continue;const[D,T]=b?[n.end,n.start]:[n.start,n.end],w=h===1,y=p-2;c.append("text").attr("x",u+(w?m/2:0)).attr("y",y).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",w?"middle":"start").text(D),w||c.append("text").attr("x",u+m).attr("y",y).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(T)}},"drawWord"),U={draw:K},X={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},J=f(({packet:t}={})=>{const e=B(X,t);return`
	.packetByte {
		font-size: ${e.byteFontSize};
	}
	.packetByte.start {
		fill: ${e.startByteColor};
	}
	.packetByte.end {
		fill: ${e.endByteColor};
	}
	.packetLabel {
		fill: ${e.labelColor};
		font-size: ${e.labelFontSize};
	}
	.packetTitle {
		fill: ${e.titleColor};
		font-size: ${e.titleFontSize};
	}
	.packetBlock {
		stroke: ${e.blockStrokeColor};
		stroke-width: ${e.blockStrokeWidth};
		fill: ${e.blockFillColor};
	}
	`},"styles"),Q={parser:S,get db(){return new C},renderer:U,styles:J};export{Q as diagram};
