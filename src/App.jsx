import React, { useState, useEffect, useRef } from 'react';
import { Heart, X, User, Home, PlusCircle, ArrowLeft, CheckCircle, Dog, MapPin, Mail, Phone, ShieldCheck, Loader2, Bookmark, Trash2, Send, Inbox, Film, Image as ImageIcon, Sparkles, ExternalLink, Download } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA6kcssJeKg5PAenfOBusldT4P58g8QB1M",
  authDomain: "adoptamatch-d9b47.firebaseapp.com",
  projectId: "adoptamatch-d9b47",
  storageBucket: "adoptamatch-d9b47.firebasestorage.app",
  messagingSenderId: "909055802495",
  appId: "1:909055802495:web:785d21aab7637e2958134a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'adopta-match-dev';

export default function App() {
  // --- ESTADOS DE LA APLICACIÓN ---
  const [view, setView] = useState('welcome'); 
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  
  // Consentimiento
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Datos de Firestore
  const [dogs, setDogs] = useState([]);
  const [savedDogs, setSavedDogs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [isLoadingDogs, setIsLoadingDogs] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  
  // Navegación Swipe
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0); 
  const [matchedDog, setMatchedDog] = useState(null);
  const [pendingMatchDog, setPendingMatchDog] = useState(null);
  const [selectedDogDetail, setSelectedDogDetail] = useState(null); 
  const [backView, setBackView] = useState('adopter-swipe'); 
  
  // Formularios y Archivos
  const [foundationAuth, setFoundationAuth] = useState({ identifier: '', password: '', isLogin: true });
  const [showPassword, setShowPassword] = useState(false);
  const [foundationData, setFoundationData] = useState({ name: '', rut: '', instagram: '', customFormFile: null, customFormFileName: '', isVerified: false });
  const [newDog, setNewDog] = useState({ name: '', sex: 'Macho', age: 'Menos de 1 año', breed: '', location: '', country: 'Chile', description: '', temporalHome: false, permanentAdoption: true, sterilized: false, microchip: false });
  const [selectedFiles, setSelectedFiles] = useState([]); 
  const [adopterForm, setAdopterForm] = useState({ name: '', email: '', phone: '' });

  // --- ESTADOS PARA HOGARES TEMPORALES ---
  const [temporalForm, setTemporalForm] = useState({ name: '', phone: '', location: '', country: 'Chile', availability: 'Inmediata', rate: 'Gratis', comments: '' });
  const [isSubmittingTemporal, setIsSubmittingTemporal] = useState(false);
  
  // UI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false); 
  const [dashTab, setDashTab] = useState('dogs');
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;
  const fileInputRef = useRef(null);

  // --- EFECTOS FIREBASE ---
  const initAuthFlow = async () => {
    if (user && !isAnonymous && role === 'foundation') {
      setView('foundation-dash');
      return;
    }
    if (user && isAnonymous && role === 'adopter') {
      setView('role-select');
      return;
    }
    
    setView('loading');
    try {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
        } catch (tokenError) {
          console.warn("Token personalizado inválido, usando cuenta anónima en su lugar:", tokenError);
          await signInAnonymously(auth);
        }
      } else {
        await signInAnonymously(auth);
      }
    } catch (error) {
      console.error("Error Auth:", error);
      setView('role-select');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAnonymous(currentUser?.isAnonymous || false);
      if (currentUser && view === 'loading') setView('role-select');
    });
    return () => unsubscribe();
  }, [view]);

  // Cargar Perros y Solicitudes
  useEffect(() => {
    if (!user) return;
    setIsLoadingDogs(true);
    
    // Perros Públicos
    const dogsRef = collection(db, 'artifacts', appId, 'public', 'data', 'dogs');
    const unsubDogs = onSnapshot(dogsRef, (snapshot) => {
      const dogsData = [];
      snapshot.forEach((doc) => dogsData.push({ id: doc.id, ...doc.data() }));
      setDogs(dogsData.reverse()); 
      setIsLoadingDogs(false);
    }, (error) => {
      console.error("Error al cargar perros:", error);
      setIsLoadingDogs(false);
    });

    // SEGURIDAD: En un entorno de producción real, las reglas de Firestore deben bloquear 
    // la lectura de esta colección para usuarios que no sean dueños de la fundación.
    const appsRef = collection(db, 'artifacts', appId, 'public', 'data', 'applications');
    const unsubApps = onSnapshot(appsRef, (snapshot) => {
      const appsData = [];
      snapshot.forEach((doc) => appsData.push({ id: doc.id, ...doc.data() }));
      setApplications(appsData.reverse());
    }, (error) => console.error("Error al cargar solicitudes:", error));

    return () => { unsubDogs(); unsubApps(); };
  }, [user]);

  // Cargar Perros Guardados del Adoptante (Privado y Seguro)
  useEffect(() => {
    if (!user) return;
    const savedRef = collection(db, 'artifacts', appId, 'users', user.uid, 'savedDogs');
    const unsubscribe = onSnapshot(savedRef, (snapshot) => {
      const savedData = [];
      snapshot.forEach((doc) => savedData.push({ ...doc.data(), savedId: doc.id }));
      setSavedDogs(savedData);
    }, (error) => console.error("Error al cargar guardados:", error));
    return () => unsubscribe();
  }, [user]);


  // --- LÓGICA DE UTILIDAD Y SEGURIDAD ---
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  // Sanitización de URLs para evitar XSS (Cross-Site Scripting)
  const sanitizeUrl = (url) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return `https://${trimmed}`;
  };

  // Función para comprimir imágenes antes de guardarlas
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      // SEGURIDAD: Verificar MIME type estricto antes de procesar
      if (!file.type.match(/image\/(jpeg|png|webp|gif)/)) {
        reject(new Error("Formato de imagen no permitido."));
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); 
        };
        img.onerror = () => reject(new Error("Archivo corrupto."));
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo."));
    });
  };

  // --- LÓGICA DE SWIPE Y FORMULARIOS ---
  const handleSwipe = async (direction, dogOverride = null) => {
    const currentDog = dogOverride || dogs[currentIndex];
    if (!currentDog) return;

    if (direction === 'right') { 
      setPendingMatchDog(currentDog);
      setBackView('adopter-swipe'); 
      setView('adoption-form');
    } 
    else if (direction === 'save') { 
      if (!user) return;
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'savedDogs', currentDog.id);
        await setDoc(docRef, currentDog);
        showToast(`¡${currentDog.name} guardado en favoritos!`);
        if (!dogOverride) {
          setCurrentIndex(prev => prev + 1);
          setCurrentPhotoIndex(0); 
        }
      } catch (e) {
        console.error("Error al guardar:", e);
        showToast('Hubo un error de seguridad al guardar.');
      }
    }
    else { 
      if (!dogOverride) {
        setCurrentIndex(prev => prev + 1);
        setCurrentPhotoIndex(0); 
      }
    }
  };

  const removeSavedDog = async (dogId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'savedDogs', dogId));
      showToast('Perrito eliminado de favoritos');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdoptionSubmit = async (e) => {
    e.preventDefault();
    if (!user || !pendingMatchDog) return;
    
    // SEGURIDAD: Limpieza básica de datos antes de enviar a base de datos
    const sanitizedName = adopterForm.name.trim().substring(0, 100);
    const sanitizedEmail = adopterForm.email.trim().toLowerCase().substring(0, 100);
    const sanitizedPhone = adopterForm.phone.trim().substring(0, 20);

    if (!sanitizedName || !sanitizedEmail || !sanitizedPhone) {
      alert("Por favor completa todos los campos correctamente.");
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'applications'), {
        dogId: pendingMatchDog.id,
        dogName: pendingMatchDog.name,
        dogImage: pendingMatchDog.image,
        foundationId: pendingMatchDog.foundationId,
        adopterName: sanitizedName,
        adopterEmail: sanitizedEmail,
        adopterPhone: sanitizedPhone,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setMatchedDog(pendingMatchDog);
      setPendingMatchDog(null);
      setAdopterForm({ name: '', email: '', phone: '' }); // Limpiar datos de memoria
      setView('match');
    } catch (error) {
      alert("Hubo un error seguro al enviar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- COMPONENTES DE VISTA: CONFIGURACIÓN INICIAL ---
  const renderWelcome = () => {
    const canContinue = acceptedPrivacy && acceptedTerms;
    return (
      <div className="flex flex-col items-center justify-between h-screen bg-orange-50 p-6 text-center">
        <div className="mt-12 flex flex-col items-center">
          <div className="bg-orange-500 p-4 rounded-full mb-6 shadow-lg shadow-orange-200"><Dog size={64} className="text-white" /></div>
          <h1 className="text-4xl font-extrabold text-gray-800 mb-2">AdoptaMatch</h1>
          <p className="text-gray-600 text-lg">Conectando corazones peludos.</p>
        </div>
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-left mb-8">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-blue-500"/> Privacidad y Datos</h3>
          <p className="text-sm text-gray-600 mb-4">Para continuar, necesitamos tu consentimiento según la normativa vigente.</p>
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 text-orange-500 rounded focus:ring-orange-500" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} />
            <span className="text-sm text-gray-700">He leído y autorizo el tratamiento de datos según la <button onClick={() => setView('privacy-policy')} className="text-orange-600 font-semibold underline">Política de Privacidad</button>.</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 text-orange-500 rounded focus:ring-orange-500" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
            <span className="text-sm text-gray-700">
  Acepto los <button onClick={() => setView('terms-conditions')} className="text-orange-600 font-semibold underline">Términos y Condiciones</button>.
</span>
          </label>
        </div>
        <button onClick={initAuthFlow} disabled={!canContinue} className={`w-full max-w-sm font-bold py-4 px-6 rounded-2xl shadow-md transition flex items-center justify-center text-lg mb-6 ${canContinue ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>Comenzar</button>
      </div>
    );
  };

  // --- VISTA: FORMULARIO QUIERO SER TEMPORAL ---
  const renderTemporalForm = () => {
    const handleTemporalSubmit = async (e) => {
      e.preventDefault();
      setIsSubmittingTemporal(true);
      try {
        // Aquí guardaremos en la base de datos de Firebase (Firestore)
        // Usaremos una colección global llamada 'temporales'
        const db = getFirestore();
        await addDoc(collection(db, 'temporales'), {
          ...temporalForm,
          createdAt: new Date().toISOString()
        });
        
        // Limpiamos el formulario y volvemos a la pantalla principal
        alert("¡Muchas gracias! Tu solicitud para ser hogar temporal ha sido enviada. Las fundaciones podrán contactarte.");
        setTemporalForm({ name: '', phone: '', location: '', country: 'Chile', availability: 'Inmediata', rate: 'Gratis', comments: '' });
        setView('welcome');
      } catch (error) {
        console.error("Error al guardar temporal:", error);
        alert("Hubo un error al enviar tu solicitud. Inténtalo de nuevo.");
      } finally {
        setIsSubmittingTemporal(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FDFBF7] max-w-md mx-auto flex flex-col">
        {/* Cabecera Morada */}
        <div className="bg-purple-600 p-6 rounded-b-3xl shadow-md text-white relative">
          <button onClick={() => setView('welcome')} className="absolute top-6 left-4 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-2xl font-bold text-center mt-2">Hogar Temporal</h1>
          <p className="text-purple-100 text-sm text-center mt-2">Inscríbete para ayudar a cuidar peludos mientras encuentran su hogar definitivo.</p>
        </div>

        {/* Formulario */}
        <div className="p-6 flex-grow overflow-y-auto">
          <form onSubmit={handleTemporalSubmit} className="space-y-4">
            
            {/* Nombre Completo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
              <input required type="text" className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500 focus:border-purple-500" placeholder="Ej. Camila Rojas" value={temporalForm.name} onChange={e => setTemporalForm({...temporalForm, name: e.target.value})} />
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (WhatsApp)</label>
              <input required type="tel" className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" placeholder="+56 9 1234 5678" value={temporalForm.phone} onChange={e => setTemporalForm({...temporalForm, phone: e.target.value})} />
            </div>

            {/* Ubicación y País */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad / Comuna</label>
                <input required type="text" className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" placeholder="Ej. Providencia" value={temporalForm.location} onChange={e => setTemporalForm({...temporalForm, location: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                <select className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" value={temporalForm.country} onChange={e => setTemporalForm({...temporalForm, country: e.target.value})}>
                  <option value="Chile">Chile</option>
                  <option value="Argentina">Argentina</option>
                  <option value="Colombia">Colombia</option>
                  <option value="México">México</option>
                </select>
              </div>
            </div>

            {/* Disponibilidad y Tarifa */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilidad</label>
                <select className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" value={temporalForm.availability} onChange={e => setTemporalForm({...temporalForm, availability: e.target.value})}>
                  <option value="Inmediata">Inmediata</option>
                  <option value="Fines de semana">Fines de semana</option>
                  <option value="Por definir">Por definir</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarifa / Costo</label>
                <select className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" value={temporalForm.rate} onChange={e => setTemporalForm({...temporalForm, rate: e.target.value})}>
                  <option value="Gratis">100% Gratis (Voluntario)</option>
                  <option value="Cobro gastos básicos">Solo cubro gastos (comida/vet)</option>
                  <option value="Cobro por día">Cobro por día (Guardería)</option>
                </select>
              </div>
            </div>

            {/* Comentarios adicionales */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Experiencia o Condiciones (Opcional)</label>
              <textarea className="w-full border-gray-300 rounded-xl p-3 border focus:ring-purple-500" rows="3" placeholder="Ej. Tengo patio grande, acepto solo cachorros, tengo otros perros..." value={temporalForm.comments} onChange={e => setTemporalForm({...temporalForm, comments: e.target.value})}></textarea>
            </div>

            {/* Botón Guardar */}
            <button 
              type="submit" 
              disabled={isSubmittingTemporal}
              className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl shadow-lg mt-6 hover:bg-purple-700 transition-colors disabled:opacity-70 flex justify-center items-center"
            >
              {isSubmittingTemporal ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : "Enviar Solicitud"}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderRoleSelect = () => (
    <div className="flex flex-col items-center justify-center h-screen bg-orange-50 p-6 text-center">
      <div className="bg-orange-500 p-4 rounded-full mb-6 shadow-lg shadow-orange-200"><Dog size={64} className="text-white" /></div>
      <h1 className="text-4xl font-extrabold text-gray-800 mb-2">AdoptaMatch</h1>
      <p className="text-gray-600 mb-10 text-lg">¿Cómo quieres usar la app hoy?</p>
      <div className="w-full max-w-sm space-y-4">
        <button onClick={() => { setRole('adopter'); setView('adopter-swipe'); }} className="w-full bg-white border-2 border-orange-500 text-orange-600 font-bold py-4 px-6 rounded-2xl shadow-sm hover:bg-orange-50 transition flex items-center justify-center gap-3 text-lg">
          <Heart size={24} /> Quiero Adoptar
        </button>
        <button onClick={() => { setRole('foundation'); setView('foundation-login'); }} className="w-full bg-orange-500 text-white font-bold py-4 px-6 rounded-2xl shadow-md hover:bg-orange-600 transition flex items-center justify-center gap-3 text-lg">
          <Home size={24} /> Soy Fundación / Rescatista
        </button>
        <button 
  onClick={() => setView('temporal-form')} 
  className="w-full border-2 border-purple-500 text-purple-600 bg-white hover:bg-purple-50 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-sm mb-6"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  Quiero ser Temporal
</button>
      </div>
    </div>
  );

const renderTermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-[#FDFBF7] max-w-md mx-auto p-6 flex flex-col justify-between">
      <div className="overflow-y-auto pr-1">
        <h2 className="font-bold text-2xl mb-6 text-gray-900 border-b pb-3">Términos y Condiciones</h2>
        
        <div className="text-gray-700 space-y-4 text-sm leading-relaxed">
          <p className="font-semibold text-orange-600">Bienvenido a AdoptaMatch.</p>
          
          <p><strong>1. Propósito de la Plataforma:</strong> AdoptaMatch es una herramienta tecnológica sin fines de lucro diseñada para facilitar el contacto entre fundaciones de rescate animal y potenciales adoptantes. No gestionamos ni cobramos comisiones por adopción.</p>
          
          <p><strong>2. Responsabilidad de la Información:</strong> Cada fundación es la única responsable de la veracidad, salud, edad y estado de los animales publicados. AdoptaMatch no se hace responsable por descripciones erróneas.</p>
          
          <p><strong>3. Uso de Datos Personales:</strong> Al completar un formulario de postulación, el adoptante acepta que sus datos de contacto (nombre, teléfono, correo) sean compartidos exclusivamente con la fundación a cargo del animal seleccionado.</p>
          
          <p><strong>4. Compromiso de Adopción:</strong> El usuario se compromete a entregar información real en sus postulaciones, entendiendo que adoptar una mascota es una responsabilidad legal y afectiva para toda la vida.</p>
        </div>
      </div>
      
      <button 
        onClick={() => setView('welcome')} 
        className="bg-orange-500 text-white p-4 rounded-xl w-full font-bold mt-6 shadow-md hover:bg-orange-600 transition-all active:scale-[0.98]"
      >
        Entendido y Volver
      </button>
    </div>
  );
};

  // --- COMPONENTES DE FUNDACIÓN ---
  const renderFoundationLogin = () => {
    // SEGURIDAD: Autenticación Real usando Firebase Auth
    const handleLogin = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      
      try {
        if (foundationAuth.isLogin) {
          await signInWithEmailAndPassword(auth, foundationAuth.identifier, foundationAuth.password);
          setView('foundation-dash');
        } else {
          await createUserWithEmailAndPassword(auth, foundationAuth.identifier, foundationAuth.password);
          setView('foundation-verify'); // Nueva cuenta requiere llenar perfil
        }
      } catch (error) {
        console.error("Error Auth:", error.message);
        let errorMsg = "Credenciales incorrectas o problema de red.";
        if (error.code === 'auth/weak-password') errorMsg = "La contraseña debe tener al menos 6 caracteres.";
        if (error.code === 'auth/email-already-in-use') errorMsg = "Este correo ya está registrado.";
        if (error.code === 'auth/invalid-email') errorMsg = "El formato del correo es inválido.";
        alert(errorMsg);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto p-6">
        <div className="mb-8">
          <button onClick={() => setView('role-select')} className="text-gray-600 mb-4"><ArrowLeft size={24} /></button>
          <h2 className="text-3xl font-bold text-gray-800">{foundationAuth.isLogin ? 'Acceso Fundación' : 'Crear Cuenta'}</h2>
          <p className="text-gray-500 mt-2">Gestiona tus rescates de forma segura y recibe solicitudes.</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input required type="email" maxLength={100} className="w-full border-gray-300 rounded-xl p-4 border focus:ring-orange-500" placeholder="contacto@fundacion.cl" value={foundationAuth.identifier} onChange={e => setFoundationAuth({...foundationAuth, identifier: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
  <div className="relative">
    <input 
      required 
      type={showPassword ? "text" : "password"} 
      minLength={6} 
      maxLength={64} 
      className="w-full border-gray-300 rounded-xl p-4 pr-12 border focus:ring-orange-500" 
      placeholder="••••••••" 
      value={foundationAuth.password} 
      onChange={e => setFoundationAuth({...foundationAuth, password: e.target.value})} 
    />
    <button 
      type="button" 
      onClick={() => setShowPassword(!showPassword)} 
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xs font-bold"
    >
      {showPassword ? 'Ocultar' : 'Mostrar'}
    </button>
  </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md mt-6 flex justify-center items-center">
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (foundationAuth.isLogin ? 'Ingresar Seguro' : 'Registrar Fundación')}
          </button>
        </form>
        <button onClick={() => setFoundationAuth({...foundationAuth, isLogin: !foundationAuth.isLogin})} className="mt-6 text-sm text-blue-600 font-bold hover:underline w-full text-center">
          {foundationAuth.isLogin ? '¿Tu fundación es nueva? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    );
  };

  const renderFoundationVerify = () => {
    const handleFormFileUpload = (e) => {
      const file = e.target.files[0];
      if (file) {
        // SEGURIDAD: Control de tamaño estricto y tipos MIME (Mitigación subida archivos maliciosos)
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        
        if (!allowedTypes.includes(file.type)) {
          alert("Por seguridad, solo se permiten documentos en formato PDF o Word.");
          e.target.value = null;
          return;
        }

        if (file.size > 800000) { 
          alert("El archivo es muy pesado. Límite máximo: 800KB.");
          e.target.value = null;
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          setFoundationData({...foundationData, customFormFile: reader.result, customFormFileName: file.name});
        };
      }
    };

    const submitProfile = (e) => {
       e.preventDefault();
       // Saneamiento de datos de la fundación
       const cleanData = {
         ...foundationData,
         name: foundationData.name.trim().substring(0, 100),
         instagram: sanitizeUrl(foundationData.instagram),
         isVerified: true
       };
       setFoundationData(cleanData);
       setView('foundation-dash');
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
        <div className="p-4 bg-white border-b flex items-center shadow-sm"><h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="text-blue-500"/> Perfil de Organización</h2></div>
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-blue-800 text-sm">Completa tus datos. Esta información es pública.</div>
          <form onSubmit={submitProfile} className="space-y-5">
            <div><label className="block text-sm font-medium mb-1">Nombre de la Organización</label><input required maxLength={80} className="w-full border p-3 rounded-lg focus:ring-blue-500" value={foundationData.name} onChange={e=>setFoundationData({...foundationData, name:e.target.value})} placeholder="Ej: Fundación Patitas" /></div>
            <div><label className="block text-sm font-medium mb-1">Instagram o Sitio Web</label><input required maxLength={150} className="w-full border p-3 rounded-lg focus:ring-blue-500" value={foundationData.instagram} onChange={e=>setFoundationData({...foundationData, instagram:e.target.value})} placeholder="ej: instagram.com/fundacion" /></div>
            <div>
              <label className="block text-sm font-medium mb-1">Cargar Formulario (Seguro: Solo PDF/Word)</label>
              <input type="file" accept=".pdf,.doc,.docx" className="w-full border p-3 rounded-lg focus:ring-blue-500 text-sm bg-white" onChange={handleFormFileUpload} />
              {foundationData.customFormFileName && <p className="text-xs text-green-600 mt-1 font-medium">Archivo seguro cargado: {foundationData.customFormFileName}</p>}
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md mt-6">Guardar y Continuar</button>
          </form>
        </div>
      </div>
    );
  };

  const renderFoundationDash = () => {
    const myDogs = dogs.filter(d => d.foundationId === user?.uid);
    const myApplications = applications.filter(a => a.foundationId === user?.uid);

    return (
      <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative flex flex-col">
         <div className="p-5 bg-orange-500 text-white shadow-md relative">
          <button onClick={() => { auth.signOut(); window.location.reload(); }} className="absolute top-5 right-5 text-white/80 hover:text-white flex items-center gap-1 text-sm"><User size={16} /> Salir Seguro</button>
          <div className="flex items-center gap-2 mb-1"><h2 className="text-xl font-bold">{foundationData.name || 'Mi Fundación'}</h2><ShieldCheck size={18} className="text-green-300" /></div>
          <p className="text-orange-100 text-sm">Panel de Administración Protegido</p>
        </div>

        <div className="flex border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
          <button onClick={() => setDashTab('dogs')} className={`flex-1 py-4 text-center font-bold text-sm border-b-2 transition-colors ${dashTab === 'dogs' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
            Mis Perros ({myDogs.length})
          </button>
          <button onClick={() => setDashTab('applications')} className={`flex-1 py-4 text-center font-bold text-sm border-b-2 transition-colors relative ${dashTab === 'applications' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
            Solicitudes {myApplications.length > 0 && <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{myApplications.length}</span>}
          </button>
          <div className="flex border-b bg-white">
  <button 
    className={`flex-1 py-4 font-bold text-sm ${foundationTab === 'dogs' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
    onClick={() => setFoundationTab('dogs')}
  >
    Mis Perros ({foundationDogs.length})
  </button>
  <button 
    className={`flex-1 py-4 font-bold text-sm ${foundationTab === 'requests' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
    onClick={() => setFoundationTab('requests')}
    // --- VISTA: DASHBOARD DE FUNDACION ---
  const renderFoundationDash = () => {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Cabecera */}
        <div className="bg-orange-600 p-4 text-white flex justify-between items-center sticky top-0 z-10 shadow-md">
          <div>
            <h1 className="font-bold text-xl flex items-center gap-2">
              Mi Fundación <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            </h1>
            <p className="text-sm text-orange-200">Panel de Administración</p>
          </div>
          <button 
            onClick={async () => {
              try {
                await signOut(auth);
                setView('welcome');
                setFoundationAuth({ isLogin: true, email: '', password: '' });
                setFoundationDogs([]);
              } catch (error) {
                console.error("Error al cerrar sesión", error);
              }
            }} 
            className="text-sm border border-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Salir Seguro
          </button>
        </div>

        {/* Pestañas (Tabs) */}
        <div className="flex border-b bg-white shadow-sm">
          <button 
            className={`flex-1 py-4 font-bold text-sm transition-colors ${foundationTab === 'dogs' ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setFoundationTab('dogs')}
          >
            Mis Perros ({foundationDogs.length})
          </button>
          <button 
            className={`flex-1 py-4 font-bold text-sm transition-colors ${foundationTab === 'requests' ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setFoundationTab('requests')}
          >
            Solicitudes
          </button>
          <button 
            className={`flex-1 py-4 font-bold text-sm transition-colors ${foundationTab === 'temporales' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setFoundationTab('temporales')}
          >
            Temporales
          </button>
        </div>

        {/* Contenido principal con scroll */}
        <div className="flex-1 overflow-y-auto pb-24">
          
          {/* TAB: MIS PERROS */}
          {foundationTab === 'dogs' && (
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-gray-600 font-medium text-sm">Tus publicaciones activas</h2>
              </div>
              
              {foundationDogs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                  <div className="text-gray-400 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">Aún no tienes perritos publicados.</p>
                  <p className="text-sm text-gray-400 mt-1">Usa el botón flotante para agregar uno.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {foundationDogs.map(dog => (
                    <div key={dog.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative group">
                      <img src={dog.image} alt={dog.name} className="w-full h-32 object-cover" />
                      <div className="p-3">
                        <h3 className="font-bold text-gray-800">{dog.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">{dog.age} • {dog.gender}</p>
                      </div>
                      <button 
                        onClick={async () => {
                          if (window.confirm(`¿Estás seguro de eliminar a ${dog.name}?`)) {
                            try {
                              await deleteDoc(doc(db, 'dogs', dog.id));
                              // La actualización local se maneja en el onSnapshot
                            } catch (error) {
                              console.error("Error al eliminar", error);
                              alert("No se pudo eliminar.");
                            }
                          }
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: SOLICITUDES */}
          {foundationTab === 'requests' && (
            <div className="p-4 space-y-4">
              <h2 className="text-gray-500 font-medium text-sm mb-2">Solicitudes de Adopción Recibidas</h2>
              
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 border-l-4 border-l-orange-500">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">María González</h3>
                  <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-bold">Para: Max</span>
                </div>
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  <p>📍 Santiago, Departamento</p>
                  <p>🐶 Experiencia: Alta (Tuvo perros antes)</p>
                  <p className="italic text-gray-500 text-xs">"Me enamoré de Max, tengo mucho espacio y trabajo desde casa."</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-green-500 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-green-600 transition-colors text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TEMPORALES */}
          {foundationTab === 'temporales' && (
            <div className="p-4 space-y-4">
              <h2 className="text-gray-500 font-medium text-sm mb-2">Red de Hogares Temporales Disponibles</h2>
              
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100 border-l-4 border-l-purple-500">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">Camila Rojas</h3>
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">100% Gratis</span>
                </div>
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  <p>📍 Providencia, Chile</p>
                  <p>🗓️ Disponibilidad: Inmediata</p>
                  <p className="italic text-gray-500 text-xs">"Tengo patio grande, acepto solo cachorros, tengo otros perros..."</p>
                </div>
                <button className="w-full bg-green-500 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-green-600 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                  Contactar por WhatsApp
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Botón Flotante para Agregar Perro */}
        {foundationTab === 'dogs' && (
          <button 
            onClick={() => setView('add-dog')} 
            className="fixed bottom-6 right-6 bg-orange-600 text-white p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-orange-700 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 font-bold z-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Agregar
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* 1. LOS BOTONES DE LAS PESTAÑAS */}
      <div className="flex border-b bg-white">
         {/* ... botones ... */}
      </div>

      {/* 2. CONTENIDO: MIS PERROS */}
      {foundationTab === 'dogs' && (
         <div className="...">...</div>
      )}

      {/* 3. CONTENIDO: SOLICITUDES */}
      {foundationTab === 'requests' && (
         <div className="...">...</div>
      )}

      {/* 4. AQUÍ DEBES PEGAR EL CONTENIDO: TEMPORALES */}
      {foundationTab === 'temporales' && (
         <div className="p-4 space-y-4">
            <h2 className="text-gray-500 font-medium text-sm mb-2">Red de Hogares Temporales Disponibles</h2>
            
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100 border-l-4 border-l-purple-500">
               <div className="flex justify-between items-start mb-2">
                 <h3 className="font-bold text-gray-800 text-lg">Camila Rojas</h3>
                 <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">100% Gratis</span>
               </div>
               <div className="text-sm text-gray-600 space-y-1 mb-3">
                 <p>📍 Providencia, Chile</p>
                 <p>🗓️ Disponibilidad: Inmediata</p>
                 <p className="italic text-gray-500 text-xs">"Tengo patio grande, acepto solo cachorros, tengo otros perros..."</p>
               </div>
               <button className="w-full bg-green-500 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-green-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                  Contactar por WhatsApp
               </button>
            </div>
         </div>
      )}

    </div> {/* CIERRE FINAL DEL RETURN */}
  );
};
  >
    Solicitudes ({requests.length})
  </button>
  {/* NUEVA PESTAÑA */}
  <button 
    className={`flex-1 py-4 font-bold text-sm ${foundationTab === 'temporales' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
    onClick={() => setFoundationTab('temporales')}
  >
    Temporales
  </button>
</div>
        
        <div className="p-4 flex-1 overflow-y-auto pb-24">
          {dashTab === 'dogs' && (
            <>
              {myDogs.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-xl border border-dashed border-gray-300 mt-4"><Dog size={48} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Aún no publicas perritos.</p></div>
              ) : (
                <div className="grid gap-4">
                  {myDogs.map(dog => (
                    <div key={dog.id} className="bg-white rounded-xl shadow-sm overflow-hidden flex border border-gray-100 relative">
                      <img src={dog.image} alt={dog.name} className="w-24 h-24 object-cover" />
                      {dog.mediaCount > 1 && <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"><ImageIcon size={10}/> {dog.mediaCount}</div>}
                      <div className="p-3 flex-1"><h3 className="font-bold text-gray-800 text-lg">{dog.name}</h3><p className="text-gray-500 text-sm">{dog.breed} • {dog.age}</p></div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setView('add-dog')} className="fixed bottom-6 right-6 lg:absolute lg:bottom-6 lg:right-6 bg-orange-500 text-white p-4 rounded-full shadow-xl hover:bg-orange-600 hover:scale-105 transition-transform z-20"><PlusCircle size={32} /></button>
            </>
          )}

          {dashTab === 'applications' && (
            <div className="grid gap-4">
              {myApplications.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-xl border border-dashed border-gray-300 mt-4"><Inbox size={48} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No tienes solicitudes pendientes.</p></div>
              ) : (
                myApplications.map(app => (
                  <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-orange-50 p-3 border-b border-orange-100 flex items-center gap-3">
                      <img src={app.dogImage} className="w-10 h-10 rounded-full object-cover border border-white" alt="dog"/>
                      <div><p className="text-xs text-orange-600 font-bold uppercase tracking-wider">Interesado en</p><p className="font-bold text-gray-800">{app.dogName}</p></div>
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <div><p className="text-xs text-gray-500">Adoptante</p><p className="font-bold text-gray-800 flex items-center gap-2"><User size={16} className="text-gray-400"/> {app.adopterName}</p></div>
                      {/* Enlaces de comunicación saneados para seguridad */}
                      <div><p className="text-xs text-gray-500">WhatsApp Seguro</p><a href={`https://wa.me/${app.adopterPhone.replace(/[^\d+]/g, '')}`} target="_blank" rel="noreferrer" className="font-bold text-green-600 flex items-center gap-2 hover:underline"><Phone size={16}/> {app.adopterPhone}</a></div>
                      <div><p className="text-xs text-gray-500">Correo Seguro</p><a href={`mailto:${encodeURIComponent(app.adopterEmail)}`} className="font-bold text-blue-600 flex items-center gap-2 hover:underline"><Mail size={16}/> {app.adopterEmail}</a></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- FORMULARIO COMPLETO PARA AGREGAR PERRO ---
  const renderAddDog = () => {
    // Manejo de Archivos (Subida segura)
    const handleFileSelect = (e) => {
      const files = Array.from(e.target.files);
      if (selectedFiles.length + files.length > 5) {
        showToast('Puedes subir un máximo de 5 archivos.');
        return;
      }
      
      const newFiles = [];
      files.forEach(file => {
        // SEGURIDAD: Solo aceptar tipos MIME de imágenes y videos conocidos
        if(file.type.match(/image\/(jpeg|png|webp)/) || file.type.match(/video\/(mp4|webm)/)) {
            newFiles.push({
              file: file,
              url: URL.createObjectURL(file), 
              type: file.type.startsWith('video/') ? 'video' : 'image'
            });
        } else {
            showToast(`Archivo "${file.name}" ignorado por formato no seguro.`);
        }
      });
      
      setSelectedFiles([...selectedFiles, ...newFiles].slice(0, 5));
    };

    const removeFile = (index) => {
      const updated = [...selectedFiles];
      URL.revokeObjectURL(updated[index].url); 
      updated.splice(index, 1);
      setSelectedFiles(updated);
    };

    // Envío del Formulario Saneado
    const handleAddDogSubmit = async (e) => {
      e.preventDefault();
      if (!user) return;
      if (selectedFiles.length === 0) {
        showToast('Debes subir al menos una foto de portada válida.');
        return;
      }

      setIsSubmitting(true);
      try {
        const finalImages = [];
        
        for (const fileObj of selectedFiles) {
          if (fileObj.type === 'image') {
             try {
               const compressed = await compressImage(fileObj.file);
               finalImages.push(compressed);
             } catch(err) {
               console.warn("Fallo al comprimir una imagen", err);
             }
          } else {
             // Placeholder para videos
             finalImages.push('https://images.unsplash.com/photo-1517849845537-4d257902454a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80');
          }
        }

        // Si fallaron todas las compresiones
        if(finalImages.length === 0) throw new Error("No se procesaron las imágenes.");

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'dogs'), {
          ...newDog, 
          // Saneamiento de textos para evitar Inyección de gran tamaño
          name: newDog.name.trim().substring(0, 50),
          breed: newDog.breed.trim().substring(0, 50),
          location: newDog.location.trim().substring(0, 80),
          country: newDog.country.trim().substring(0, 50),
          description: newDog.description.trim().substring(0, 1500),
          foundationId: user.uid, 
          foundationName: foundationData.name || 'Mi Fundación',
          contactEmail: foundationAuth.identifier || 'contacto@fundacion.cl', 
          contactPhone: '+56 9 1111 2222', 
          customFormFile: foundationData.customFormFile || null, 
          customFormFileName: foundationData.customFormFileName || '', 
          image: finalImages[0], 
          images: finalImages, 
          mediaCount: finalImages.length, 
          createdAt: new Date().toISOString()
        });

        setNewDog({ name: '', sex: 'Macho', age: 'Menos de 1 año', breed: '', location: '', country: 'Chile', description: '', temporalHome: false, permanentAdoption: true, sterilized: false, microchip: false });
        selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
        setSelectedFiles([]);
        setDashTab('dogs');
        setView('foundation-dash');
        showToast('¡Perrito publicado con éxito!');
        
      } catch (error) { 
        console.error(error); 
        alert("Error de seguridad al publicar. Intenta con otra imagen.");
      } finally { 
        setIsSubmitting(false); 
      }
    };

    const generateDescriptionWithAI = async () => {
      if (!newDog.name || !newDog.breed) {
        showToast('Llena al menos el Nombre y la Raza para usar la IA.');
        return;
      }
      setIsGeneratingAI(true);
      const apiKey = "";
      // Saneamiento del prompt para evitar inyección
      const safeName = newDog.name.replace(/[^a-zA-Z0-9 ]/g, "").substring(0,30);
      const safeBreed = newDog.breed.replace(/[^a-zA-Z0-9 ]/g, "").substring(0,30);

      const promptText = `Escribe una descripción persuasiva y tierna (máximo 3 párrafos cortos) para dar en adopción a este perro. Usa estos datos:\nNombre: ${safeName}\nSexo: ${newDog.sex}\nEdad: ${newDog.age}\nRaza: ${safeBreed}\nEsterilizado: ${newDog.sterilized ? 'Sí' : 'No'}\nMicrochip: ${newDog.microchip ? 'Sí' : 'No'}\nNo uses hashtags.`;
      
      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: "Eres un voluntario experto en rescate animal que redacta perfiles de adopción." }] }
      };

      let retries = 0;
      const delays = [1000, 2000, 4000];

      while (retries < 3) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!response.ok) throw new Error("Error API");
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            setNewDog(prev => ({ ...prev, description: text }));
            showToast('¡Descripción generada con éxito!');
            setIsGeneratingAI(false);
            return;
          }
        } catch (err) {
          await new Promise(res => setTimeout(res, delays[retries]));
          retries++;
        }
      }
      showToast('Error al conectar con la IA. Ingresa el texto manualmente.');
      setIsGeneratingAI(false);
    };

    return (
      <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col relative z-20">
        <div className="p-4 bg-white border-b flex items-center shadow-sm sticky top-0 z-10">
          <button onClick={() => setView('foundation-dash')} className="mr-4 text-gray-600"><ArrowLeft size={24} /></button>
          <h2 className="text-xl font-bold text-gray-800">Agregar Perrito</h2>
        </div>
        
        <form onSubmit={handleAddDogSubmit} className="p-4 space-y-5 flex-1 overflow-y-auto pb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-1">Fotos y Videos <span className="text-gray-400 font-normal text-sm">({selectedFiles.length}/5)</span></h3>
            <p className="text-xs text-gray-500 mb-3">La primera imagen que selecciones será la portada.</p>
            
            <div className="grid grid-cols-3 gap-3 mb-2">
              {selectedFiles.map((fileObj, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-sm group">
                  {fileObj.type === 'video' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white relative">
                      <Film size={24} className="mb-1" />
                      <span className="text-[10px]">Video</span>
                    </div>
                  ) : (
                    <img src={fileObj.url} alt={`preview-${index}`} className="w-full h-full object-cover" />
                  )}
                  <button type="button" onClick={() => removeFile(index)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition">
                    <X size={14} />
                  </button>
                  {index === 0 && <span className="absolute bottom-0 left-0 w-full bg-orange-500 text-white text-[10px] font-bold text-center py-1">PORTADA</span>}
                </div>
              ))}
              {selectedFiles.length < 5 && (
                <button type="button" onClick={() => fileInputRef.current.click()} className="aspect-square rounded-xl border-2 border-dashed border-orange-300 flex flex-col items-center justify-center text-orange-500 hover:bg-orange-50 transition bg-white">
                  <PlusCircle size={28} className="mb-1" />
                  <span className="text-xs font-semibold">Subir</span>
                </button>
              )}
            </div>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">Nombre</label>
              <input required maxLength={50} className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" 
                value={newDog.name} onChange={e=>setNewDog({...newDog, name:e.target.value})} placeholder="Ej: Toby" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">Sexo</label>
              <select required className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition bg-white" 
                value={newDog.sex} onChange={e=>setNewDog({...newDog, sex:e.target.value})}>
                <option value="Macho">Macho</option>
                <option value="Hembra">Hembra</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">Edad Aproximada</label>
              <select required className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition bg-white" 
                value={newDog.age} onChange={e=>setNewDog({...newDog, age:e.target.value})}>
                <option value="Menos de 1 año">Menos de 1 año</option>
                {[...Array(20)].map((_, i) => (
                  <option key={i+1} value={`${i+1} año${i === 0 ? '' : 's'}`}>{i+1} año{i === 0 ? '' : 's'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">Raza / Tipo</label>
              <input required maxLength={50} className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" 
                value={newDog.breed} onChange={e=>setNewDog({...newDog, breed:e.target.value})} placeholder="Ej: Mestizo" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">Ciudad / Ubicación</label>
              <input required maxLength={80} className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" 
                value={newDog.location} onChange={e=>setNewDog({...newDog, location:e.target.value})} placeholder="Ej: Providencia, RM" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 pl-1">País</label>
              <input required maxLength={50} className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" 
                value={newDog.country} onChange={e=>setNewDog({...newDog, country:e.target.value})} placeholder="Ej: Chile" />
            </div>
          </div>

          <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 space-y-3">
            <h4 className="text-sm font-bold text-gray-800">Estado y Requisitos</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white p-2 rounded-lg border border-gray-200">
                <input type="checkbox" checked={newDog.permanentAdoption} onChange={e => setNewDog({...newDog, permanentAdoption: e.target.checked})} className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded" />
                Adopción Definitiva
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white p-2 rounded-lg border border-gray-200">
                <input type="checkbox" checked={newDog.temporalHome} onChange={e => setNewDog({...newDog, temporalHome: e.target.checked})} className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded" />
                Hogar Temporal
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white p-2 rounded-lg border border-gray-200">
                <input type="checkbox" checked={newDog.sterilized} onChange={e => setNewDog({...newDog, sterilized: e.target.checked})} className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded" />
                Esterilizado
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white p-2 rounded-lg border border-gray-200">
                <input type="checkbox" checked={newDog.microchip} onChange={e => setNewDog({...newDog, microchip: e.target.checked})} className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded" />
                Tiene Chip
              </label>
            </div>
          </div>
          
          <div className="relative">
            <div className="flex justify-between items-end mb-1 pl-1">
              <label className="block text-sm font-bold text-gray-700">Descripción y Personalidad</label>
              <button type="button" onClick={generateDescriptionWithAI} disabled={isGeneratingAI} className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
                {isGeneratingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isGeneratingAI ? 'Generando...' : 'Autocompletar con IA'}
              </button>
            </div>
            <textarea required maxLength={1500} rows={5} className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition resize-none" 
              value={newDog.description} onChange={e=>setNewDog({...newDog, description:e.target.value})} placeholder="Usa la IA o cuéntanos su historia aquí..." />
          </div>
          
          <button type="submit" disabled={isSubmitting || selectedFiles.length === 0} 
            className={`w-full text-white font-bold py-4 rounded-xl shadow-lg mt-6 flex justify-center items-center transition 
              ${selectedFiles.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 hover:scale-[1.02]'}`}>
            {isSubmitting ? <Loader2 className="animate-spin" size={24}/> : 'Publicar Perrito'}
          </button>
        </form>
      </div>
    );
  };

  // --- COMPONENTES DE ADOPTANTE ---
  const renderAdoptionForm = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <div className="p-4 bg-white border-b flex items-center shadow-sm sticky top-0 z-10"><button onClick={() => { setPendingMatchDog(null); setView(backView); }} className="mr-4 text-gray-600"><ArrowLeft size={24} /></button><h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Send size={20} className="text-orange-500"/> Contactar</h2></div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-orange-100 rounded-2xl p-4 mb-6 flex items-center gap-4"><img src={pendingMatchDog?.image} alt="dog" className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" /><div><p className="text-sm text-orange-800 font-medium">Estás a un paso de conocer a</p><h3 className="text-xl font-bold text-orange-900">{pendingMatchDog?.name}</h3></div></div>
        <form onSubmit={handleAdoptionSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Tu Nombre Completo</label><input required maxLength={100} className="w-full border border-gray-300 rounded-xl p-3" value={adopterForm.name} onChange={e=>setAdopterForm({...adopterForm, name: e.target.value})} /></div>
          <div><label className="block text-sm font-medium mb-1">Tu Teléfono (WhatsApp)</label><input required type="tel" maxLength={20} className="w-full border border-gray-300 rounded-xl p-3" value={adopterForm.phone} onChange={e=>setAdopterForm({...adopterForm, phone: e.target.value})} /></div>
          <div><label className="block text-sm font-medium mb-1">Tu Correo Electrónico</label><input required type="email" maxLength={100} className="w-full border border-gray-300 rounded-xl p-3" value={adopterForm.email} onChange={e=>setAdopterForm({...adopterForm, email: e.target.value})} /></div>
          <button type="submit" disabled={isSubmitting} className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl shadow-md mt-6 flex justify-center items-center">{isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Enviar mis datos'}</button>
        </form>
      </div>
    </div>
  );

  const renderMatch = () => (
    <div className="h-screen bg-orange-50 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto relative">
      <div className="bg-white p-4 rounded-full shadow-lg mb-6 text-green-500 border-4 border-green-50"><CheckCircle size={64} /></div>
      <h1 className="text-3xl font-black text-gray-800 mb-2">¡Solicitud Enviada!</h1>
      <p className="text-gray-600 mb-8 font-medium text-sm">Tus datos están seguros en la bandeja de la fundación. Ellos te contactarán pronto por {matchedDog?.name}.</p>
      <div className="w-full bg-white p-6 rounded-3xl shadow-sm mb-6 border border-orange-100">
        <h3 className="font-bold text-gray-800 mb-2 text-left">¿No quieres esperar?</h3>
        <p className="font-semibold text-lg text-left text-orange-600">{matchedDog?.foundationName}</p>
        
        {matchedDog?.customFormFile && (
          <a href={sanitizeUrl(matchedDog.customFormFile)} download={matchedDog.customFormFileName || "formulario_adopcion.pdf"} className="mt-4 w-full bg-blue-50 text-blue-600 border border-blue-200 font-bold py-3 rounded-xl flex justify-center items-center gap-2 hover:bg-blue-100 transition shadow-sm">
            <Download size={18} /> Descargar Formulario Oficial
          </a>
        )}

        <div className="flex items-center gap-3 mt-4 text-gray-700 text-left bg-gray-50 p-3 rounded-xl border border-gray-100"><Phone size={18} className="text-orange-500"/> <span className="font-medium">{matchedDog?.contactPhone || '+56 9 1234 5678'}</span></div>
        <div className="flex items-center gap-3 mt-2 text-gray-700 text-left bg-gray-50 p-3 rounded-xl border border-gray-100"><Mail size={18} className="text-orange-500"/> <span className="font-medium">{matchedDog?.contactEmail || 'contacto@fundacion.cl'}</span></div>
      </div>
      <button onClick={() => { setCurrentIndex(prev => prev + 1); setView('adopter-swipe'); }} className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl shadow-md">Seguir viendo perritos</button>
    </div>
  );

  const renderAdopterSwipe = () => {
    const currentDog = dogs[currentIndex];
    
    const onTouchEndHandler = () => {
      if (!touchStart || !touchEnd) return;
      const distance = touchStart - touchEnd;
      if (distance > minSwipeDistance) handleSwipe('left');
      if (distance < -minSwipeDistance) handleSwipe('right');
      setTouchStart(null);
      setTouchEnd(null);
    };

    const nextPhoto = (e) => {
      e.stopPropagation();
      if (currentDog?.images && currentPhotoIndex < currentDog.images.length - 1) {
        setCurrentPhotoIndex(prev => prev + 1);
      }
    };

    const prevPhoto = (e) => {
      e.stopPropagation();
      if (currentPhotoIndex > 0) {
        setCurrentPhotoIndex(prev => prev - 1);
      }
    };

    return (
      <div className="h-screen bg-gray-100 flex flex-col max-w-md mx-auto relative overflow-hidden">
        <div className="flex justify-between items-center p-4 bg-white shadow-sm z-10 relative">
          <button onClick={() => setView('role-select')} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={24} /></button>
          <h2 className="text-xl font-bold text-orange-500 flex items-center gap-2"><Dog size={20}/> AdoptaMatch</h2>
          <button onClick={() => setView('adopter-profile')} className="text-gray-400 hover:text-orange-500 transition-colors relative">
            <Bookmark size={26} />
            {savedDogs.length > 0 && <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{savedDogs.length}</span>}
          </button>
        </div>
        
        <div className="flex-1 relative overflow-hidden w-full flex items-center justify-center p-4">
          {isLoadingDogs ? (
            <div className="flex flex-col items-center text-gray-400"><Loader2 className="animate-spin mb-4" size={48} /><p>Buscando perritos...</p></div>
          ) : currentDog ? (
            <div className="w-full h-full max-h-[650px] bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col relative transition-transform" 
              onTouchStart={(e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }} 
              onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)} 
              onTouchEnd={onTouchEndHandler}>
              
              <div className="relative w-full h-[45%] shrink-0 bg-gray-900 overflow-hidden">
                <img 
                  src={currentDog.images && currentDog.images.length > 0 ? currentDog.images[currentPhotoIndex] : currentDog.image} 
                  alt="bg" 
                  className="absolute inset-0 w-full h-full object-cover opacity-40 blur-xl scale-110 pointer-events-none" 
                  onError={(e) => e.target.src = 'https://via.placeholder.com/400x500?text=Perrito'} 
                />

                <div className="absolute top-0 left-0 w-1/2 h-full z-20" onClick={prevPhoto}></div>
                <div className="absolute top-0 right-0 w-1/2 h-full z-20" onClick={nextPhoto}></div>

                <img 
                  src={currentDog.images && currentDog.images.length > 0 ? currentDog.images[currentPhotoIndex] : currentDog.image} 
                  alt={currentDog.name} 
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" 
                  onError={(e) => e.target.src = 'https://via.placeholder.com/400x500?text=Perrito'} 
                />
                
                {currentDog.images && currentDog.images.length > 1 && (
                  <div className="absolute top-3 left-0 w-full flex gap-1 px-3 z-30 pointer-events-none">
                    {currentDog.images.map((_, idx) => (
                      <div key={idx} className={`h-1 flex-1 rounded-full shadow-sm transition-colors ${idx === currentPhotoIndex ? 'bg-white' : 'bg-white/40'}`} />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 p-4 md:p-5 flex flex-col overflow-hidden bg-white">
                <div className="shrink-0">
                  <h1 className="text-3xl font-black text-gray-800 flex items-end gap-2 leading-none">
                    {currentDog.name} <span className="text-xl font-normal text-gray-500 mb-0.5">{currentDog.age}</span>
                  </h1>
                  <p className="text-gray-500 text-sm flex items-center gap-1 mt-1 font-medium"><MapPin size={14}/> {currentDog.location}, {currentDog.country || 'Chile'}</p>
                  
                  <div className="flex flex-wrap gap-2 mt-3 mb-2 shrink-0">
                    <span className="bg-gray-100 text-gray-700 border border-gray-200 text-xs px-2.5 py-1 rounded-full font-medium">{currentDog.sex || 'Desconocido'}</span>
                    {currentDog.sterilized && <span className="bg-blue-50 text-blue-700 border border-blue-100 text-xs px-2.5 py-1 rounded-full font-medium">Esterilizado</span>}
                    {currentDog.microchip && <span className="bg-green-50 text-green-700 border border-green-100 text-xs px-2.5 py-1 rounded-full font-medium">Con Chip</span>}
                    {(currentDog.temporalHome && !currentDog.permanentAdoption) && <span className="bg-orange-100 text-orange-700 border border-orange-200 text-xs px-2.5 py-1 rounded-full font-bold">Solo Temporal</span>}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 styled-scrollbar min-h-[80px]">
                  <h3 className="font-bold text-gray-800 text-sm mb-1 mt-1">Sobre mí</h3>
                  <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{currentDog.description}</p>
                </div>
              </div>
            </div>
          ) : (
             <div className="text-center p-8 text-gray-500"><div className="bg-gray-200 p-4 rounded-full inline-block mb-4"><Dog size={48} className="text-gray-400" /></div><h2 className="text-2xl font-bold mb-2">¡No hay más perritos!</h2><button onClick={() => setCurrentIndex(0)} className="mt-6 bg-orange-500 text-white px-6 py-2 rounded-full font-bold">Volver a empezar</button></div>
          )}
        </div>
        
        {!isLoadingDogs && currentDog && (
          <div className="h-28 flex justify-center items-center gap-6 pb-6 z-10 px-4 shrink-0">
            <button onClick={() => handleSwipe('left')} className="bg-white p-4 rounded-full shadow-lg border-2 border-red-100 text-red-500 hover:bg-red-50 hover:scale-110 transition-transform"><X size={32} strokeWidth={3} /></button>
            <button onClick={() => handleSwipe('save')} className="bg-white p-3 rounded-full shadow-lg border-2 border-blue-100 text-blue-500 hover:bg-blue-50 hover:scale-110 transition-transform mt-4"><Bookmark size={26} strokeWidth={2.5} /></button>
            <button onClick={() => handleSwipe('right')} className="bg-white px-6 py-4 rounded-full shadow-lg border-2 border-green-100 text-green-600 font-bold hover:bg-green-50 hover:scale-105 transition-transform flex items-center gap-2"><Heart size={24} strokeWidth={3} fill="currentColor" className="text-green-500" /> Adoptar</button>
          </div>
        )}
      </div>
    );
  };

  const renderAdopterProfile = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      <div className="p-4 bg-white border-b flex items-center shadow-sm sticky top-0 z-10"><button onClick={() => setView('adopter-swipe')} className="mr-4 text-gray-600"><ArrowLeft size={24} /></button><h2 className="text-xl font-bold text-gray-800">Mis Favoritos</h2></div>
      <div className="p-4 flex-1 overflow-y-auto pb-20">
        {savedDogs.length === 0 ? (
          <div className="text-center p-8 bg-white rounded-xl border border-dashed border-gray-300 mt-4"><Bookmark size={48} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Aún no has guardado perritos.</p></div>
        ) : (
          <div className="grid gap-4">
            {savedDogs.map(dog => (
              <div key={dog.savedId} className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-100">
                <div className="flex cursor-pointer hover:bg-gray-50 transition" onClick={() => { setSelectedDogDetail(dog); setCurrentPhotoIndex(0); setView('dog-detail'); }}>
                  <img src={dog.image} alt={dog.name} className="w-28 h-28 object-cover" />
                  <div className="p-3 flex-1 flex flex-col justify-center">
                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{dog.name}</h3>
                    <p className="text-gray-500 text-sm mb-1">{dog.breed}</p>
                    <p className="text-xs text-blue-500 mt-1 font-medium">Ver perfil completo</p>
                  </div>
                </div>
                <div className="border-t border-gray-100 bg-gray-50 flex divide-x divide-gray-200">
                  <button onClick={() => removeSavedDog(dog.savedId)} className="flex-1 py-3 text-red-500 flex items-center justify-center gap-2 font-medium text-sm hover:bg-red-50"><Trash2 size={16} /> Quitar</button>
                  <button onClick={() => { setBackView('adopter-profile'); setPendingMatchDog(dog); setView('adoption-form'); }} className="flex-1 py-3 text-green-600 flex items-center justify-center gap-2 font-bold text-sm hover:bg-green-50"><Send size={16} /> Contactar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderDogDetail = () => {
    const dog = selectedDogDetail;
    if (!dog) return null;

    const nextPhoto = (e) => {
      e.stopPropagation();
      if (dog.images && currentPhotoIndex < dog.images.length - 1) {
        setCurrentPhotoIndex(prev => prev + 1);
      }
    };

    const prevPhoto = (e) => {
      e.stopPropagation();
      if (currentPhotoIndex > 0) {
        setCurrentPhotoIndex(prev => prev - 1);
      }
    };

    return (
      <div className="h-screen bg-white flex flex-col max-w-md mx-auto relative overflow-hidden">
        <div className="relative h-[40vh] w-full shrink-0 bg-gray-900 overflow-hidden">
          <button onClick={() => { setView('adopter-profile'); setCurrentPhotoIndex(0); }} className="absolute top-4 left-4 z-30 bg-black/50 text-white p-3 rounded-full backdrop-blur-sm hover:bg-black/70 transition shadow-lg">
            <ArrowLeft size={24} />
          </button>

          <img 
            src={dog.images && dog.images.length > 0 ? dog.images[currentPhotoIndex] : dog.image} 
            alt="bg" 
            className="absolute inset-0 w-full h-full object-cover opacity-40 blur-xl scale-110 pointer-events-none" 
            onError={(e) => e.target.src = 'https://via.placeholder.com/400x500?text=Perrito'} 
          />

          <div className="absolute top-0 left-0 w-1/2 h-full z-20" onClick={prevPhoto}></div>
          <div className="absolute top-0 right-0 w-1/2 h-full z-20" onClick={nextPhoto}></div>

          <img 
            src={dog.images && dog.images.length > 0 ? dog.images[currentPhotoIndex] : dog.image} 
            alt={dog.name} 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" 
            onError={(e) => e.target.src = 'https://via.placeholder.com/400x500?text=Perrito'} 
          />

          {dog.images && dog.images.length > 1 && (
            <div className="absolute top-4 left-0 w-full flex gap-1 px-16 z-30 pointer-events-none">
              {dog.images.map((_, idx) => (
                <div key={idx} className={`h-1 flex-1 rounded-full shadow-sm transition-colors ${idx === currentPhotoIndex ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 p-6 flex flex-col overflow-hidden bg-white pb-24">
          <div className="shrink-0">
            <h1 className="text-3xl font-black text-gray-800 flex items-end gap-2 leading-none">
              {dog.name} <span className="text-xl font-normal text-gray-500 mb-0.5">{dog.age}</span>
            </h1>
            <p className="text-gray-500 text-sm flex items-center gap-1 mt-1 font-medium"><MapPin size={14}/> {dog.location}, {dog.country || 'Chile'}</p>
            
            <div className="flex flex-wrap gap-2 mt-4 mb-3 shrink-0">
              <span className="bg-gray-100 text-gray-700 border border-gray-200 text-xs px-3 py-1.5 rounded-full font-medium">{dog.sex || 'Desconocido'}</span>
              {dog.sterilized && <span className="bg-blue-50 text-blue-700 border border-blue-100 text-xs px-3 py-1.5 rounded-full font-medium">Esterilizado</span>}
              {dog.microchip && <span className="bg-green-50 text-green-700 border border-green-100 text-xs px-3 py-1.5 rounded-full font-medium">Con Chip</span>}
              {(dog.temporalHome && !dog.permanentAdoption) && <span className="bg-orange-100 text-orange-700 border border-orange-200 text-xs px-3 py-1.5 rounded-full font-bold">Solo Temporal</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 styled-scrollbar min-h-[100px]">
            <h3 className="font-bold text-gray-800 mb-2">Sobre mí</h3>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{dog.description}</p>
          </div>
        </div>
        
        <div className="absolute bottom-6 w-full px-6 z-30">
          <button onClick={() => { setBackView('dog-detail'); setPendingMatchDog(dog); setView('adoption-form'); }} className="w-full bg-green-500 text-white px-6 py-4 rounded-2xl shadow-xl font-bold hover:bg-green-600 hover:scale-[1.02] transition-transform flex justify-center items-center gap-2">
            <Send size={20} /> Contactar a la Fundación
          </button>
        </div>
      </div>
    );
  };

  const renderPrivacyPolicy = () => (
    <div className="min-h-screen bg-white max-w-md mx-auto p-6"><h2 className="font-bold text-xl mb-4">Políticas de Privacidad</h2><p className="text-gray-600 mb-6">Tus datos están protegidos y solo se compartirán cuando envíes una solicitud explícita a una fundación.</p><button onClick={() => setView('welcome')} className="bg-orange-500 text-white p-3 rounded-xl w-full font-bold">Volver</button></div>
  );

  return (
    <div className="font-sans antialiased text-gray-900 bg-gray-900 w-full min-h-screen flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative overflow-hidden">
        
        {toastMessage && (<div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl z-50 text-sm font-bold animate-in slide-in-from-top fade-in duration-300">{toastMessage}</div>)}
        
        {view === 'loading' && <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-orange-500" size={48}/></div>}
        {view === 'welcome' && renderWelcome()}
        {view === 'privacy-policy' && renderPrivacyPolicy()}
        {view === 'role-select' && renderRoleSelect()}
        {view === 'terms-conditions' && renderTermsAndConditions()}
        {view === 'temporal-form' && renderTemporalForm()}
        
        {view === 'foundation-login' && renderFoundationLogin()}
        {view === 'foundation-verify' && renderFoundationVerify()}
        {view === 'foundation-dash' && renderFoundationDash()}
        {view === 'add-dog' && renderAddDog()}

        {view === 'adopter-swipe' && renderAdopterSwipe()}
        {view === 'adoption-form' && renderAdoptionForm()}
        {view === 'adopter-profile' && renderAdopterProfile()}
        {view === 'dog-detail' && renderDogDetail()}
        {view === 'match' && renderMatch()}
      </div>
    </div>
  );
}
