(function(){
"use strict";
var C=window.__QUIKCHAT||{},CLR=C.color||"#4F46E5",POS=C.position||"bottom-right",
SHOP=window.Shopify&&window.Shopify.shop||"",
API="/apps/chat",SK="qc_cid",R=POS==="bottom-right",
cid=localStorage.getItem(SK),msgs=[],poll=null,open=false;

function $(id){return document.getElementById(id)}
function esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML}
function tm(d){return new Date(d).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}

async function init(){
try{
var r=await fetch(API+"?action=config&shop="+SHOP);
var d=await r.json();
if(!d.enabled)return;
render(d.welcomeMessage||"Hi! How can we help?");
if(cid){showChat();loadMsgs()}
}catch(e){console.error("[QC]",e)}
}

function render(welcome){
var s=document.createElement("style");
var p=R?"right":"left";
s.textContent=`
#qc *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
#qc-b{position:fixed;bottom:24px;${p}:24px;width:56px;height:56px;border-radius:50%;background:${CLR};color:#fff;border:0;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);z-index:99998;display:flex;align-items:center;justify-content:center}
#qc-b:hover{transform:scale(1.06)}
#qc-w{position:fixed;bottom:92px;${p}:24px;width:360px;height:500px;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.16);z-index:99999;display:none;flex-direction:column;overflow:hidden}
@media(max-width:400px){#qc-w{width:calc(100vw - 16px);height:calc(100vh - 110px);${p}:8px;bottom:84px}}
#qc-h{background:${CLR};color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between}
#qc-h h3{font-size:15px;font-weight:600}
#qc-x{background:0;border:0;color:#fff;cursor:pointer;font-size:20px;opacity:.8}
#qc-m{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
.qm{max-width:78%;padding:9px 13px;border-radius:12px;font-size:14px;line-height:1.4;word-wrap:break-word}
.qm-c{align-self:flex-end;background:${CLR};color:#fff;border-bottom-right-radius:3px}
.qm-a{align-self:flex-start;background:#f3f4f6;color:#1f2937;border-bottom-left-radius:3px}
.qm-s{align-self:center;color:#9ca3af;font-size:12px;padding:3px}
.qm-t{font-size:11px;opacity:.6;margin-top:3px}
#qc-p{flex:1;padding:20px;display:flex;flex-direction:column;gap:12px}
#qc-p p{font-size:14px;color:#6b7280;line-height:1.5}
.qi{width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:14px;outline:0}
.qi:focus{border-color:${CLR}}
#qc-sb{padding:9px 18px;background:${CLR};color:#fff;border:0;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer}
#qc-sb:disabled{opacity:.5}
#qc-i{padding:10px 14px;border-top:1px solid #e5e7eb;display:flex;gap:7px;align-items:center}
#qc-mi{flex:1;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:18px;font-size:14px;outline:0}
#qc-mi:focus{border-color:${CLR}}
#qc-se{width:34px;height:34px;border-radius:50%;background:${CLR};color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center}
`;
document.head.appendChild(s);

var c=document.createElement("div");c.id="qc";
c.innerHTML=`<button id="qc-b" aria-label="Chat"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
<div id="qc-w"><div id="qc-h"><h3>Chat with us</h3><button id="qc-x">&times;</button></div>
<div id="qc-p"><p>${esc(welcome)}</p><input class="qi" id="qc-n" placeholder="Your name"><input class="qi" id="qc-e" placeholder="Email (optional)" type="email"><textarea class="qi" id="qc-fm" placeholder="How can we help?" rows="3"></textarea><button id="qc-sb">Start Chat</button></div>
<div id="qc-m" style="display:none"></div>
<div id="qc-i" style="display:none"><input id="qc-mi" placeholder="Type a message..."><button id="qc-se"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div></div>`;
document.body.appendChild(c);

$("qc-b").onclick=toggle;
$("qc-x").onclick=toggle;
$("qc-sb").onclick=start;
$("qc-se").onclick=send;
$("qc-mi").onkeydown=function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
}

function toggle(){
open=!open;
$("qc-w").style.display=open?"flex":"none";
if(open&&cid){startPoll();scrollB()}else{stopPoll()}
}

async function start(){
var n=($("qc-n").value||"").trim()||"Visitor",
e=($("qc-e").value||"").trim(),
m=($("qc-fm").value||"").trim();
if(!m){$("qc-fm").focus();return}
$("qc-sb").disabled=true;$("qc-sb").textContent="Starting...";
try{
var r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({intent:"start",customerName:n,customerEmail:e,message:m,pageUrl:location.href})});
var d=await r.json();
if(d.conversationId){cid=d.conversationId;localStorage.setItem(SK,cid);showChat();await loadMsgs();startPoll()}
}catch(er){$("qc-sb").disabled=false;$("qc-sb").textContent="Start Chat"}
}

async function send(){
var inp=$("qc-mi"),t=(inp.value||"").trim();
if(!t||!cid)return;
addMsg("customer",t);inp.value="";
try{await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({intent:"message",conversationId:cid,content:t})})}catch(e){}
}

async function loadMsgs(){
if(!cid)return;
try{var r=await fetch(API+"?action=messages&conversationId="+cid);
var d=await r.json();if(d.messages){msgs=d.messages;renderMsgs()}}catch(e){}
}

function renderMsgs(){
var c=$("qc-m");c.innerHTML="";
msgs.forEach(function(m){
var d=document.createElement("div");
d.className="qm qm-"+(m.senderType==="customer"?"c":m.senderType==="agent"?"a":"s");
d.innerHTML="<div>"+esc(m.content)+"</div><div class='qm-t'>"+tm(m.createdAt)+"</div>";
c.appendChild(d)});
scrollB()
}

function addMsg(type,text){
var c=$("qc-m"),d=document.createElement("div");
d.className="qm qm-"+(type==="customer"?"c":"a");
d.innerHTML="<div>"+esc(text)+"</div><div class='qm-t'>"+tm(new Date().toISOString())+"</div>";
c.appendChild(d);scrollB()
}

function showChat(){$("qc-p").style.display="none";$("qc-m").style.display="flex";$("qc-i").style.display="flex"}
function scrollB(){var c=$("qc-m");if(c)c.scrollTop=c.scrollHeight}

function startPoll(){stopPoll();poll=setInterval(async function(){
if(!cid||!open)return;
try{var af=msgs.length?msgs[msgs.length-1].createdAt:null,
u=API+"?action=messages&conversationId="+cid+(af?"&after="+af:""),
r=await fetch(u),d=await r.json();
if(d.messages&&d.messages.length){
var nw=d.messages.filter(function(m){return m.senderType!=="customer"});
if(nw.length){msgs=msgs.concat(d.messages);renderMsgs()}
}}catch(e){}
},3000)}
function stopPoll(){if(poll){clearInterval(poll);poll=null}}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
