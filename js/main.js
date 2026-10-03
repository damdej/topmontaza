(function(){
var root=document.getElementById('radovi');
function esc(t){return String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
function img(x,n,l){var u=x.slika.charAt(0)==='/'?x.slika:'/'+x.slika;
return '<img src="/.netlify/images?url='+encodeURI(u)+'&w=1000" onerror="this.onerror=null;this.src=\''+encodeURI(u)+'\'" alt="'+esc(x.opis||('Montaža nameštaja Beograd: '+l+', slika '+n))+'" loading="lazy" decoding="async">'}
function bind(){var t=root.querySelectorAll('.tabs button'),c=root.querySelectorAll('.car');
t.forEach(function(b){b.onclick=function(){t.forEach(function(x){x.setAttribute('aria-selected',x===b)});c.forEach(function(x){x.hidden=x.dataset.i!==b.dataset.i});var k=c[b.dataset.i].querySelector('.trk');if(k)k.scrollLeft=0}});
c.forEach(function(x){var k=x.querySelector('.trk');if(!k)return;x.querySelector('.p').onclick=function(){k.scrollBy({left:-k.clientWidth*.8,behavior:'smooth'})};x.querySelector('.n').onclick=function(){k.scrollBy({left:k.clientWidth*.8,behavior:'smooth'})}})}
function build(d){var C=d.kategorije||[];if(!C.length)return;
root.querySelector('.tabs').innerHTML=C.map(function(c,i){return '<button type="button" role="tab" aria-selected="'+(i===0)+'" data-i="'+i+'">'+esc(c.naziv)+'</button>'}).join('');
root.querySelector('.cars').innerHTML=C.map(function(c,i){var S=c.slike||[];return '<div class="car" data-i="'+i+'"'+(i?' hidden':'')+'>'+(S.length?'<button class="cb p" type="button" aria-label="Prethodna slika">&lsaquo;</button><div class="trk">'+S.map(function(x,n){return img(x,n+1,c.naziv)}).join('')+'</div><button class="cb n" type="button" aria-label="Sledeća slika">&rsaquo;</button>':'<p class="empty">Slike radova stižu uskoro.</p>')+'</div>'}).join('');bind()}
bind();
fetch('galerija.json',{cache:'no-cache'}).then(function(r){return r.json()}).then(build).catch(function(){});
})();
