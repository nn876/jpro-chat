import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, query, onSnapshot, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// TU CONFIG DE FIREBASE - YA ESTÁ LISTA
const firebaseConfig = {
  apiKey: "AIzaSyDWWb3B8oYYe_uiwllsDHsUtmzUv_SKcdU",
  authDomain: "jpro-chat.firebaseapp.com",
  projectId: "jpro-chat",
  storageBucket: "jpro-chat.firebasestorage.app",
  messagingSenderId: "533021046255",
  appId: "1:533021046255:web:0209ceff9564b1aa06721a"
};

const appFirebase = initializeApp(firebaseConfig);
const dbFirebase = getFirestore(appFirebase);

let userData = { numero: null, contactos: {} };
let chatActual = '';
let grabando = false;
let mediaRecorder;
let audioChunks = [];
let unsubscribeChat = null;

function init(){
  const tema = localStorage.getItem('tema') || 'oscuro';
  document.documentElement.setAttribute('data-tema', tema);
  if(tema === 'claro'){
    document.getElementById('switchTema')?.classList.add('activo');
    document.getElementById('textoTema').textContent = 'Claro';
  }

  const notif = localStorage.getItem('notif');
  if(notif === 'false'){
    document.getElementById('switchNotif')?.classList.remove('activo');
    document.getElementById('textoNotif').textContent = 'Desactivadas';
  }

  const fondo = localStorage.getItem('fondoChat');
  if(fondo) document.documentElement.style.setProperty('--bg-fondo-chat', `url('${fondo}')`);

  ir('bienvenida');
}

function ir(pantalla){
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(pantalla).classList.add('activa');
}

function mostrarError(msg){
  const el = document.getElementById('errorNumero');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 3000);
}

function mostrarErrorAdd(msg){
  const el = document.getElementById('errorAdd');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 3000);
}

function formatearHora(timestamp){
  if(!timestamp) return '';
  const fecha = timestamp.toDate? timestamp.toDate() : new Date(timestamp);
  return fecha.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
}

async function confirmarNumero(){
  const numero = document.getElementById('inputNumero').value.trim();
  if(numero.length < 9){
    mostrarError('El número debe tener al menos 9 dígitos');
    return;
  }

  userData.numero = numero;

  const userRef = doc(dbFirebase, 'usuarios', numero);
  const userSnap = await getDoc(userRef);

  if(!userSnap.exists()){
    await setDoc(userRef, {
      numero: numero,
      creado: serverTimestamp()
    });
  }

  cargarContactos();
  ir('contactos');
}

async function cargarContactos(){
  const q = query(collection(dbFirebase, 'usuarios', userData.numero, 'contactos'));
  onSnapshot(q, (snapshot) => {
    userData.contactos = {};
    const lista = document.getElementById('listaContactos');
    lista.innerHTML = '';

    snapshot.forEach((doc) => {
      const contacto = doc.data();
      userData.contactos[contacto.numero] = contacto;

      const div = document.createElement('div');
      div.className = 'contacto';
      div.onclick = () => abrirChat(contacto.numero);
      div.innerHTML = `
        <div class="avatar">${contacto.nombre[0].toUpperCase()}</div>
        <div class="info-contacto">
          <div class="nombre-contacto">${contacto.nombre}</div>
          <div class="numero-contacto">${contacto.numero}</div>
        </div>
      `;
      lista.appendChild(div);
    });

    if(snapshot.empty){
      lista.innerHTML = '<p class="vacio">No tienes contactos aún. Toca + para agregar</p>';
    }
  });
}

function mostrarAgregar(){
  ir('agregar');
}

function volverContactos(){
  ir('contactos');
}

async function agregarContacto(){
  const numero = document.getElementById('numeroNuevo').value.trim();
  const nombre = document.getElementById('nombreNuevo').value.trim();

  if(numero.length < 9){
    mostrarErrorAdd('El número debe tener al menos 9 dígitos');
    return;
  }
  if(!nombre){
    mostrarErrorAdd('Ingresa un nombre');
    return;
  }
  if(numero === userData.numero){
    mostrarErrorAdd('No puedes agregarte a ti mismo');
    return;
  }

  await setDoc(doc(dbFirebase, 'usuarios', userData.numero, 'contactos', numero), {
    numero: numero,
    nombre: nombre,
    agregado: serverTimestamp()
  });

  document.getElementById('numeroNuevo').value = '';
  document.getElementById('nombreNuevo').value = '';
  ir('contactos');
}

function abrirChat(numero){
  chatActual = numero;
  const contacto = userData.contactos[numero];

  document.getElementById('nombreChat').textContent = contacto.nombre;
  document.getElementById('numeroChat').textContent = numero;
  document.getElementById('avatarChat').textContent = contacto.nombre[0].toUpperCase();

  cargarMensajes(numero);
  ir('chat');
}

function cargarMensajes(numeroContacto){
  if(unsubscribeChat) unsubscribeChat();

  const chatId = [userData.numero, numeroContacto].sort().join('_');
  const q = query(
    collection(dbFirebase, 'chats', chatId, 'mensajes'),
    orderBy('timestamp', 'asc')
  );

  unsubscribeChat = onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById('mensajes');
    contenedor.innerHTML = '';

    snapshot.forEach((doc) => {
      const msg = doc.data();
      const div = document.createElement('div');
      div.className = `mensaje ${msg.emisor === userData.numero? 'enviado' : 'recibido'}`;

      if(msg.tipo === 'texto'){
        div.innerHTML = `
          <div class="texto-mensaje">${msg.contenido}</div>
          <div class="hora-mensaje">${formatearHora(msg.timestamp)}</div>
        `;
      } else if(msg.tipo === 'audio'){
        div.innerHTML = `
          <audio controls src="${msg.contenido}"></audio>
          <div class="hora-mensaje">${formatearHora(msg.timestamp)}</div>
        `;
      }
      contenedor.appendChild(div);
    });

    contenedor.scrollTop = contenedor.scrollHeight;
  });
}

async function enviarMensaje(){
  const input = document.getElementById('inputMensaje');
  const texto = input.value.trim();

  if(!texto ||!chatActual) return;

  const chatId = [userData.numero, chatActual].sort().join('_');

  await addDoc(collection(dbFirebase, 'chats', chatId, 'mensajes'), {
    emisor: userData.numero,
    receptor: chatActual,
    contenido: texto,
    tipo: 'texto',
    timestamp: serverTimestamp()
  });

  input.value = '';
}

function manejarEnter(e){
  if(e.key === 'Enter'){
    enviarMensaje();
  }
}

async function toggleGrabacion(){
  if(!grabando){
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = enviarAudio;

      mediaRecorder.start();
      grabando = true;
      document.getElementById('btnGrabar').classList.add('grabando');
    } catch(err){
      alert('No se pudo acceder al micrófono');
    }
  } else {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    grabando = false;
    document.getElementById('btnGrabar').classList.remove('grabando');
  }
}

async function enviarAudio(){
  if(audioChunks.length === 0) return;

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const reader = new FileReader();

  reader.onloadend = async () => {
    const base64Audio = reader.result;
    const chatId = [userData.numero, chatActual].sort().join('_');

    await addDoc(collection(dbFirebase, 'chats', chatId, 'mensajes'), {
      emisor: userData.numero,
      receptor: chatActual,
      contenido: base64Audio,
      tipo: 'audio',
      timestamp: serverTimestamp()
    });
  };

  reader.readAsDataURL(audioBlob);
  audioChunks = [];
}

// AJUSTES
function toggleTema(){
  const temaActual = document.documentElement.getAttribute('data-tema');
  const nuevoTema = temaActual === 'claro'? 'oscuro' : 'claro';
  document.documentElement.setAttribute('data-tema', nuevoTema);
  document.getElementById('switchTema').classList.toggle('activo');
  document.getElementById('textoTema').textContent = nuevoTema === 'claro'? 'Claro' : 'Oscuro';
  localStorage.setItem('tema', nuevoTema);
}

function toggleNotificaciones(){
  const activo = document.getElementById('switchNotif').classList.contains('activo');
  document.getElementById('switchNotif').classList.toggle('activo');
  document.getElementById('textoNotif').textContent = activo? 'Desactivadas' : 'Activadas';
  localStorage.setItem('notif',!activo);
}

function exportarBackup(){
  const backup = {
    version: '1.0',
    numero: userData.numero,
    contactos: userData.contactos,
    fecha: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jpro-backup-${userData.numero}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ Contactos exportados correctamente');
}

async function importarBackup(event){
  const file = event.target.files[0];
  if(!file) return;

  try {
    const texto = await file.text();
    const backup = JSON.parse(texto);

    if(!backup.contactos ||!backup.numero){
      alert('❌ Archivo de backup inválido');
      return;
    }

    if(!confirm(`¿Importar ${Object.keys(backup.contactos).length} contactos? Se agregarán a tu lista actual.`)){
      return;
    }

    const promesas = Object.values(backup.contactos).map(contacto =>
      setDoc(doc(dbFirebase, 'usuarios', userData.numero, 'contactos', contacto.numero), {
        numero: contacto.numero,
        nombre: contacto.nombre,
        agregado: serverTimestamp()
      })
    );

    await Promise.all(promesas);
    alert('✅ Contactos importados correctamente');
    event.target.value = '';
  } catch(e){
    alert('❌ Error al importar: ' + e.message);
  }
}

function cambiarFondo(){
  const url = prompt('Pega la URL de una imagen para el fondo del chat:');
  if(url){
    document.documentElement.style.setProperty('--bg-fondo-chat', `url('${url}')`);
    localStorage.setItem('fondoChat', url);
  }
}

function cerrarSesion(){
  if(confirm('¿Seguro que quieres cerrar sesión?')){
    localStorage.clear();
    location.reload();
  }
}

window.onload = init;
window.confirmarNumero = confirmarNumero;
window.mostrarAgregar = mostrarAgregar;
window.volverContactos = volverContactos;
window.agregarContacto = agregarContacto;
window.abrirChat = abrirChat;
window.enviarMensaje = enviarMensaje;
window.manejarEnter = manejarEnter;
window.toggleGrabacion = toggleGrabacion;
window.ir = ir;
window.toggleTema = toggleTema;
window.toggleNotificaciones = toggleNotificaciones;
window.exportarBackup = exportarBackup;
window.importarBackup = importarBackup;
window.cambiarFondo = cambiarFondo;
window.cerrarSesion = cerrarSesion;