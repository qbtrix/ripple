import{p as at}from"./chunk-JWPE2WC7-BBvWj59Z.js";import{X as b,$ as G,bb as rt,g as nt,s as it,a as ot,b as st,q as lt,p as ct,_ as g,l as B,c as ut,O as dt,R as gt,aa as pt,d as ht,y as ft,P as mt}from"./mermaid.core-DfbsjEgB.js";import{p as vt}from"./cynefin-EF2NZ3EQ-BQ2WkHff.js";import"./main-XJybDSWU.js";import{d as Z}from"./arc-BhRDedwQ.js";import{o as xt}from"./ordinal-CxptdPJm.js";function yt(t,n){return n<t?-1:n>t?1:n>=t?0:NaN}function St(t){return t}function wt(){var t=St,n=yt,S=null,T=b(0),l=b(G),p=b(0);function i(e){var r,s=(e=rt(e)).length,h,w,C=0,f=new Array(s),o=new Array(s),D=+T.apply(this,arguments),E=Math.min(G,Math.max(-G,l.apply(this,arguments)-D)),k,L=Math.min(Math.abs(E)/s,p.apply(this,arguments)),u=L*(E<0?-1:1),A;for(r=0;r<s;++r)(A=o[f[r]=r]=+t(e[r],r,e))>0&&(C+=A);for(n!=null?f.sort(function(M,m){return n(o[M],o[m])}):S!=null&&f.sort(function(M,m){return S(e[M],e[m])}),r=0,w=C?(E-s*u)/C:0;r<s;++r,D=k)h=f[r],A=o[h],k=D+(A>0?A*w:0)+u,o[h]={data:e[h],index:r,value:A,startAngle:D,endAngle:k,padAngle:L};return o}return i.value=function(e){return arguments.length?(t=typeof e=="function"?e:b(+e),i):t},i.sortValues=function(e){return arguments.length?(n=e,S=null,i):n},i.sort=function(e){return arguments.length?(S=e,n=null,i):S},i.startAngle=function(e){return arguments.length?(T=typeof e=="function"?e:b(+e),i):T},i.endAngle=function(e){return arguments.length?(l=typeof e=="function"?e:b(+e),i):l},i.padAngle=function(e){return arguments.length?(p=typeof e=="function"?e:b(+e),i):p},i}var At=mt.pie,I={sections:new Map,showData:!1},W=I.sections,V=I.showData,$t=structuredClone(At),Ct=g(()=>structuredClone($t),"getConfig"),Dt=g(()=>{W=new Map,V=I.showData,ft()},"clear"),bt=g(({label:t,value:n})=>{if(n<0)throw new Error(`"${t}" has invalid value: ${n}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);W.has(t)||(W.set(t,n),B.debug(`added new section: ${t}, with value: ${n}`))},"addSection"),Tt=g(()=>W,"getSections"),kt=g(t=>{V=t},"setShowData"),zt=g(()=>V,"getShowData"),J={getConfig:Ct,clear:Dt,setDiagramTitle:ct,getDiagramTitle:lt,setAccTitle:st,getAccTitle:ot,setAccDescription:it,getAccDescription:nt,addSection:bt,getSections:Tt,setShowData:kt,getShowData:zt},Et=g((t,n)=>{at(t,n),n.setShowData(t.showData),t.sections.map(n.addSection)},"populateDb"),Mt={parse:g(async t=>{const n=await vt("pie",t);B.debug(n),Et(n,J)},"parse")},Rt=g(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieCircle.highlighted{
    scale: 1.05;
    opacity: 1;
  }
  .pieCircle.highlightedOnHover:hover{
    transition-duration: 250ms;
    scale: 1.05;
    opacity: 1;
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),Lt=Rt,Ot=g(t=>{const n=[...t.values()].reduce((l,p)=>l+p,0),S=[...t.entries()].map(([l,p])=>({label:l,value:p})).filter(l=>l.value/n*100>=1);return wt().value(l=>l.value).sort(null)(S)},"createPieArcs"),Pt=g((t,n,S,T)=>{B.debug(`rendering pie chart
`+t);const l=T.db,p=ut(),i=dt(l.getConfig(),p.pie),e=40,r=18,s=4,h=450,w=h,C=gt(n),f=C.append("g");f.attr("transform","translate("+w/2+","+h/2+")");const{themeVariables:o}=p;let[D]=pt(o.pieOuterStrokeWidth);D??=2;const E=i.legendPosition,k=i.textPosition,L=i.donutHole>0&&i.donutHole<=.9?i.donutHole:0,u=Math.min(w,h)/2-e,A=Z().innerRadius(L*u).outerRadius(u),M=Z().innerRadius(u*k).outerRadius(u*k),m=f.append("g");m.append("circle").attr("cx",0).attr("cy",0).attr("r",u+D/2).attr("class","pieOuterCircle");const O=l.getSections(),K=Ot(O),Q=[o.pie1,o.pie2,o.pie3,o.pie4,o.pie5,o.pie6,o.pie7,o.pie8,o.pie9,o.pie10,o.pie11,o.pie12];let _=0;O.forEach(a=>{_+=a});const U=K.filter(a=>(a.data.value/_*100).toFixed(0)!=="0"),F=xt(Q).domain([...O.keys()]);m.selectAll("mySlices").data(U).enter().append("path").attr("d",A).attr("fill",a=>F(a.data.label)).attr("class",a=>{let c="pieCircle";return i.highlightSlice==="hover"?c+=" highlightedOnHover":i.highlightSlice===a.data.label&&(c+=" highlighted"),c}),m.selectAll("mySlices").data(U).enter().append("text").text(a=>(a.data.value/_*100).toFixed(0)+"%").attr("transform",a=>"translate("+M.centroid(a)+")").style("text-anchor","middle").attr("class","slice");const Y=f.append("text").text(l.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText"),R=[...O.entries()].map(([a,c])=>({label:a,value:c})),$=f.selectAll(".legend").data(R).enter().append("g").attr("class","legend");$.append("rect").attr("width",r).attr("height",r).style("fill",a=>F(a.label)).style("stroke",a=>F(a.label)),$.append("text").attr("x",r+s).attr("y",r-s).text(a=>l.getShowData()?`${a.label} [${a.value}]`:a.label);const z=Math.max(...$.selectAll("text").nodes().map(a=>a?.getBoundingClientRect().width??0));let P=h,H=w+e;const d=r+s,N=R.length*d;switch(E){case"center":$.attr("transform",(a,c)=>{const v=d*R.length/2,x=-z/2-(r+s),y=c*d-v;return"translate("+x+","+y+")"});break;case"top":P+=N,$.attr("transform",(a,c)=>{const v=u,x=-z/2-(r+s),y=c*d-v;return`translate(${x}, ${y})`}),m.attr("transform",()=>`translate(0, ${N+d})`);break;case"bottom":P+=N,$.attr("transform",(a,c)=>{const v=-u-d,x=-z/2-(r+s),y=c*d-v;return"translate("+x+","+y+")"});break;case"left":H+=r+s+z,$.attr("transform",(a,c)=>{const v=d*R.length/2,x=-u-(r+s),y=c*d-v;return"translate("+x+","+y+")"}),m.attr("transform",()=>`translate(${z+r+s}, 0)`);break;default:H+=r+s+z,$.attr("transform",(a,c)=>{const v=d*R.length/2,x=12*r,y=c*d-v;return"translate("+x+","+y+")"});break}const X=Y.node()?.getBoundingClientRect().width??0,tt=w/2-X/2,et=w/2+X/2,j=Math.min(0,tt),q=Math.max(H,et)-j;C.attr("viewBox",`${j} 0 ${q} ${P}`),ht(C,P,q,i.useMaxWidth)},"draw"),Wt={draw:Pt},_t={parser:Mt,db:J,renderer:Wt,styles:Lt};export{_t as diagram};
