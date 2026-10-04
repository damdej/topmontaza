(function(){
var API='/api/admin',KEY='tm_admin',MAX=1600,QUALITY=.82;
var $=function(id){return document.getElementById(id)};
var login=$('login'),panel=$('panel'),tabs=$('tabs'),grid=$('grid'),queueBox=$('queue-box'),queueEl=$('queue'),msg=$('msg'),files=$('files');
var cats=[],current=0,queue=[],busy=false;

function session(){try{return localStorage.getItem(KEY)}catch(e){return null}}
function setSession(v){try{v?localStorage.setItem(KEY,v):localStorage.removeItem(KEY)}catch(e){}}
function esc(t){return String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
function say(el,text,cls){el.textContent=text||'';el.className='msg'+(cls?' '+cls:'')}

function api(action,body){
  body=body||{};body.action=action;
  var h={'Content-Type':'application/json'};
  if(session())h.Authorization='Bearer '+session();
  return fetch(API,{method:'POST',headers:h,body:JSON.stringify(body)}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(d){
      if(r.status===401&&action!=='login'){setSession(null);show()}
      if(!r.ok)throw new Error(d.error||('Greška '+r.status));
      return d;
    });
  });
}

function show(){
  var inside=!!session();
  login.hidden=inside;panel.hidden=!inside;$('logout').hidden=!inside;
  if(inside)load();else $('password').focus();
}

function load(){
  say(msg,'Učitavanje…');
  api('list').then(function(d){cats=d.kategorije||[];if(current>=cats.length)current=0;say(msg,'');render()})
    .catch(function(e){say(msg,e.message,'err')});
}

function render(){
  tabs.innerHTML=cats.map(function(c,i){return '<button type="button" role="tab" aria-selected="'+(i===current)+'" data-i="'+i+'">'+esc(c.naziv)+' ('+(c.slike||[]).length+')</button>'}).join('');
  var c=cats[current];if(!c){grid.innerHTML='';$('count').textContent='';return}
  var S=c.slike||[];
  $('count').textContent=c.naziv+', broj slika: '+S.length;
  grid.innerHTML=S.length?S.map(function(x){
    var u=x.slika.charAt(0)==='/'?x.slika:'/'+x.slika;
    return '<figure><img src="'+esc(encodeURI(u))+'" alt="'+esc(x.opis||'')+'" loading="lazy" decoding="async"><button type="button" data-del="'+esc(x.slika)+'" aria-label="Obriši sliku">&times;</button></figure>';
  }).join(''):'<p class="empty">Još nema slika u ovoj kategoriji.</p>';
}

// tek poslata slika postoji na sajtu tek kad Cloudflare Pages završi objavu
grid.addEventListener('error',function(e){
  var i=e.target;if(i.tagName!=='IMG')return;
  i.parentNode.classList.add('pending');
},true);

tabs.onclick=function(e){
  var b=e.target.closest('button');if(!b||busy)return;
  current=+b.dataset.i;render();
};

grid.onclick=function(e){
  var b=e.target.closest('button[data-del]');if(!b||busy)return;
  if(!confirm('Obrisati ovu sliku sa sajta?'))return;
  busy=true;b.disabled=true;say(msg,'Brisanje…');
  api('delete',{slika:b.dataset.del}).then(function(d){cats=d.kategorije;render();say(msg,'Slika je obrisana.','ok')})
    .catch(function(e){b.disabled=false;say(msg,e.message,'err')})
    .then(function(){busy=false});
};

/* ---------- smanjivanje slike u browseru ---------- */

function decode(file){
  if(window.createImageBitmap){
    return createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return decodeImg(file)});
  }
  return decodeImg(file);
}
function decodeImg(file){
  return new Promise(function(ok,no){
    var u=URL.createObjectURL(file),i=new Image();
    i.onload=function(){URL.revokeObjectURL(u);ok(i)};
    i.onerror=function(){URL.revokeObjectURL(u);no(new Error('Fajl nije slika koju telefon može da pročita.'))};
    i.src=u;
  });
}
function shrink(file){
  return decode(file).then(function(src){
    var w=src.width,h=src.height,k=Math.min(1,MAX/Math.max(w,h));
    var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    if(src.close)src.close();
    var url=c.toDataURL('image/jpeg',QUALITY);
    return {preview:url,data:url.slice(url.indexOf(',')+1)};
  });
}

/* ---------- red za slanje ---------- */

files.onchange=function(){
  var picked=[].slice.call(files.files);files.value='';
  if(!picked.length)return;
  say(msg,'Priprema slika…');
  picked.reduce(function(p,f){
    return p.then(function(){return shrink(f)}).then(function(r){queue.push({preview:r.preview,data:r.data,opis:'',state:''})})
      .catch(function(){say(msg,'Neke slike nisu mogle da se pročitaju: '+f.name,'err')});
  },Promise.resolve()).then(function(){if(msg.className==='msg')say(msg,'');drawQueue()});
};

function drawQueue(){
  queueBox.hidden=!queue.length;
  queueEl.innerHTML=queue.map(function(q,i){
    return '<li class="'+q.state+'"><img src="'+q.preview+'" alt=""><div><input type="text" data-i="'+i+'" maxlength="200" placeholder="Opis (nije obavezno)" value="'+esc(q.opis)+'"'+(busy?' disabled':'')+'><small>'+(q.state==='done'?'Poslato':q.state==='fail'?'Nije poslato':q.state==='work'?'Šalje se…':'Čeka')+'</small></div></li>';
  }).join('');
  $('send').textContent='Pošalji ('+queue.length+') u '+(cats[current]?cats[current].naziv:'');
  $('send').disabled=$('cancel').disabled=busy;
}
queueEl.oninput=function(e){var i=e.target.dataset.i;if(i!==undefined)queue[+i].opis=e.target.value};
$('cancel').onclick=function(){queue=[];drawQueue();say(msg,'')};

$('send').onclick=function(){
  if(busy||!queue.length||!cats[current])return;
  busy=true;var kategorija=cats[current].naziv,n=0;
  queue.reduce(function(p,q){
    return p.then(function(){
      if(q.sha)return;
      q.state='work';drawQueue();say(msg,'Slanje '+(++n)+' od '+queue.length+'…');
      return api('blob',{data:q.data}).then(function(d){q.sha=d.sha;q.state='done';drawQueue()});
    });
  },Promise.resolve()).then(function(){
    say(msg,'Upis u galeriju…');
    return api('commit',{kategorija:kategorija,slike:queue.map(function(q){return {sha:q.sha,opis:q.opis}})});
  }).then(function(d){
    var k=queue.length;queue=[];busy=false;cats=d.kategorije;drawQueue();render();
    say(msg,'Poslato: '+k+'. Na sajtu se pojavljuju za oko minut.','ok');
  }).catch(function(e){
    queue.forEach(function(q){if(q.state==='work')q.state='fail'});
    busy=false;drawQueue();say(msg,e.message+' Pokušajte ponovo dugmetom Pošalji.','err');
  });
};

/* ---------- prijava ---------- */

login.onsubmit=function(e){
  e.preventDefault();
  var b=login.querySelector('button');b.disabled=true;say($('login-msg'),'Provera…');
  api('login',{password:$('password').value}).then(function(d){
    setSession(d.session);$('password').value='';say($('login-msg'),'');show();
  }).catch(function(e){say($('login-msg'),e.message,'err')}).then(function(){b.disabled=false});
};
$('logout').onclick=function(){setSession(null);queue=[];drawQueue();show()};

show();
})();
