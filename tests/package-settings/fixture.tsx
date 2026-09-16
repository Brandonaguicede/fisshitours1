import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BoatToursPackagesEditor from '../../src/components/admin/BoatToursPackagesEditor';
import { BookingPanel } from '../../src/components/booking/BookingPanel';
import { TourDetailModal } from '../../src/components/tours/TourDetailModal';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { getActiveBoatTours } from '../../src/services/boatTourService';
import type { BoatTour } from '../../src/types/boatTour';
import '../../src/index.css';
import '../../src/styles/admin.css';
const boat = { id: 'test-boat', slug: 'test-boat', name: 'Test boat', maxGuests: 10, image: '/images/papagayo-logo.png', length: '32 feet', engine: '', featuredSpec: '', tours: [] };
function Customer() {
  const { data: tours = [] } = useQuery({ queryKey: ['boatTours', 'active'], queryFn: getActiveBoatTours });
  const [id, setId] = useState('full');
  const [detail, setDetail] = useState(false);
  if (!tours.length) return <p>Cargando catálogo</p>;
  const selected = tours.find((tour) => tour.id === id);
  return <div className="bg-ocean-950 p-4"><button onClick={() => setDetail(true)}>Ver detalles del paquete</button><BookingPanel selectedBoat={boat} selectedTour={selected} boats={[boat]} tours={tours} onBoatChange={() => {}} onTourChange={(tour) => setId(tour?.id ?? '')} />{detail && selected ? <TourDetailModal boat={boat} tour={selected} packageTours={tours} open={detail} onClose={() => setDetail(false)} onSelect={(tour: BoatTour) => setId(tour.id)} /> : null}</div>;
}
function Fixture() {
  const [customer, setCustomer] = useState(false);
  return <><button onClick={() => setCustomer((value) => !value)}>{customer ? 'Abrir administrador' : 'Abrir reserva'}</button>{customer ? <Customer /> : <div className="admin-shell" style={{ display: 'block', padding: 20 }}><BoatToursPackagesEditor boatId={boat.id} boatName={boat.name} boatMaxGuests={10} /></div>}</>;
}
createRoot(document.getElementById('fixture-root')!).render(<QueryClientProvider client={new QueryClient()}><LanguageProvider><MemoryRouter><Fixture /></MemoryRouter></LanguageProvider></QueryClientProvider>);
