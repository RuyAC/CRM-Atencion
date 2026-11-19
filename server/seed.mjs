export const restaurant = {
  id: 'est-local', name: 'Mate bar', slug: 'mate-bar',
  primaryColor: '#0284c7', logoUrl: '', coverUrl: '', timezone: 'America/La_Paz', currency: 'BOB', language: 'es-BO',
};

export const settings = {
  welcomeTitle: '¿Cómo podemos ayudarte?',
  welcomeSubtitle: 'Toca el botón de abajo para llamar a nuestro equipo directamente a tu mesa.', currency: 'BOB',
  cooldownSeconds: 10, presenceMode: 'basic', wifiName: '', wifiPassword: '', sessionMinutes: 90,
  latitude: '', longitude: '', radiusMeters: 100, showUnavailable: true,
  tvRequirePin: true, tvShowActions: true, tvAutoAccept: false, tvAutoAcceptSeconds: 30, tvAutoComplete: false, tvAutoCompleteSeconds: 120,
  scheduleEnabled: false, paused: false, pauseMessage: 'La atención está temporalmente pausada.',
  hours: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'].map((day, index) => ({ day, index, closed: false, open: '11:00', close: '23:00' })),
  printOptions: { qr: true, nfc: true, name: true, logo: true, table: true, instructions: true, branding: true,
    theme: 'classic', text: 'Apunta la cámara al código QR o acerca tu teléfono (NFC) para recibir atención.' },
};

const photo = (id, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
export const entities = {
  tables: Array.from({ length: 5 }, (_, index) => ({ id: `mesa-${String(index + 1).padStart(2, '0')}`, number: index + 1,
    name: `Mesa ${String(index + 1).padStart(2, '0')}`, token: `table-${String(index + 1).padStart(2, '0')}`, tokenVersion: 1, active: true })),
  categories: [
    { id: 'cat-entradas', name: 'Entradas', description: 'Para empezar bien', order: 0 },
    { id: 'cat-principais', name: 'Platos principales', description: 'Preparados con cariño', order: 1 },
    { id: 'cat-bebidas', name: 'Bebidas', description: 'Refresca tu momento', order: 2 },
    { id: 'cat-sobremesas', name: 'Postres', description: 'Un final dulce', order: 3 },
  ],
  products: [
    { id: 'produto-1', categoryId: 'cat-entradas', name: 'Bruschetta de la casa', description: 'Pan artesanal crujiente, tomates frescos, albahaca y aceite de oliva extra virgen.', price: 2490, promoPrice: null, imageUrl: '/assets/produto-1.jpg', videoUrl: '', tags: ['Vegetariano', 'Artesanal'], featured: true, available: true, order: 0 },
    { id: 'produto-2', categoryId: 'cat-principais', name: 'Burger de la casa', description: 'Hamburguesa artesanal de 180 g, queso, lechuga, tomate y nuestra salsa especial. Acompañada de papas.', price: 4290, promoPrice: 3690, imageUrl: '/assets/produto-2.jpg', videoUrl: '', tags: ['Más pedido', 'Especial de la casa'], featured: true, available: true, order: 1 },
    { id: 'produto-3', categoryId: 'cat-principais', name: 'Pasta al pesto', description: 'Pasta fresca con pesto de albahaca, parmesano y tomates cherry.', price: 3890, promoPrice: null, imageUrl: '/assets/produto-3.jpg', videoUrl: '', tags: ['Vegetariano'], featured: true, available: true, order: 2 },
    { id: 'produto-4', categoryId: 'cat-bebidas', name: 'Limonada especial', description: 'Limón fresco, hierbabuena y hielo. Preparada al momento para ti.', price: 1490, promoPrice: null, imageUrl: '/assets/produto-4.jpg', videoUrl: '', tags: ['Sin gluten'], featured: false, available: true, order: 3 },
    { id: 'produto-5', categoryId: 'cat-bebidas', name: 'Mate de la casa', description: 'Nuestro mate frío con un toque de limón.', price: 1200, promoPrice: null, imageUrl: '/assets/produto-5.jpg', videoUrl: '', tags: ['Especial de la casa'], featured: false, available: true, order: 4 },
    { id: 'produto-6', categoryId: 'cat-sobremesas', name: 'Brownie con helado', description: 'Brownie de chocolate caliente con helado de vainilla y salsa de chocolate.', price: 2290, promoPrice: null, imageUrl: '/assets/produto-6.jpg', videoUrl: '', tags: ['Más pedido'], featured: false, available: true, order: 5 },
  ],
  buttons: [
    { id: 'btn-call', label: 'Llamar al garzón', description: 'Atención en la mesa', type: 'CALL', url: '', requirePresence: true, active: true, order: 0 },
    { id: 'btn-menu', label: 'Ver menú', description: 'Fotos y precios', type: 'MENU', url: '', requirePresence: false, active: true, order: 1 },
    { id: 'btn-bill', label: 'Pedir la cuenta', description: 'Pago en la mesa', type: 'BILL_REQUEST', url: '', requirePresence: true, active: true, order: 2 },
  ],
  staff: [
    { id: 'owner-local', name: 'Mate bar', email: 'ventas@matebar.com', role: 'OWNER', active: true },
    { id: 'manager-local', name: 'Gerente', email: 'gerente@local.test', role: 'MANAGER', active: true },
    { id: 'staff-local', name: 'Equipo de atención', email: 'garcom@local.test', role: 'STAFF', active: true },
  ],
  networks: [],
  orders: [],
};

export const credentials = [
  { id: 'owner-local', email: 'ventas@matebar.com', password: 'Atencion2026!', pin: '1234' },
  { id: 'manager-local', email: 'gerente@local.test', password: 'Gerente2026!', pin: '2345' },
  { id: 'staff-local', email: 'garcom@local.test', password: 'Garcom2026!', pin: '3456' },
];

