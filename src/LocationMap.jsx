import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin=L.divIcon({className:'s-map-pin',html:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z" fill="#ef4444" stroke="white" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="white"/></svg>',iconSize:[32,42],iconAnchor:[16,42]});

export default function LocationMap({latitude,longitude,radius,onChange}) {
  const element=useRef(null),mapRef=useRef(null),markerRef=useRef(null),circleRef=useRef(null),changeRef=useRef(onChange);changeRef.current=onChange;
  const valid=latitude!==''&&longitude!==''&&Number.isFinite(Number(latitude))&&Number.isFinite(Number(longitude));
  const lat=valid?Number(latitude):-16.5000,lng=valid?Number(longitude):-68.1500;
  useEffect(()=>{
    const map=L.map(element.current,{scrollWheelZoom:false}).setView([lat,lng],16);mapRef.current=map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'}).addTo(map);
    const marker=L.marker([lat,lng],{icon:pin,draggable:true,keyboard:true,title:'Posición del restaurante'}).addTo(map);markerRef.current=marker;
    const circle=L.circle([lat,lng],{radius:Number(radius)||100,color:'#ef4444',weight:2,dashArray:'6 6',fillColor:'#ef4444',fillOpacity:.09}).addTo(map);circleRef.current=circle;
    function move(position){marker.setLatLng(position);circle.setLatLng(position);changeRef.current(position.lat.toFixed(7),position.lng.toFixed(7));}
    map.on('click',e=>move(e.latlng));marker.on('dragend',()=>move(marker.getLatLng()));
    const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(element.current);
    return()=>{observer.disconnect();map.remove();mapRef.current=null;};
  },[]);
  useEffect(()=>{const map=mapRef.current;if(!map)return;const position=[lat,lng];markerRef.current.setLatLng(position);circleRef.current.setLatLng(position);circleRef.current.setRadius(Number(radius)||100);if(valid&&!map.getBounds().contains(position))map.panTo(position,{animate:!matchMedia('(prefers-reduced-motion:reduce)').matches});},[lat,lng,radius,valid]);
  function moveKeyboard(e){if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;if(e.target.closest('.leaflet-control'))return;e.preventDefault();const step=.0001;changeRef.current((lat+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0)).toFixed(7),(lng+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)).toFixed(7));}
  return <div className="s-map-wrap"><div className="s-leaflet-map" ref={element} role="application" tabIndex={0} aria-label="Mapa del restaurante. Haz clic o arrastra el pin para posicionarlo. Usa las flechas para ajustar la ubicación." onKeyDown={moveKeyboard}/><span className="s-map-instruction">Arrastra el pin o haz clic en el mapa para posicionar el restaurante</span><small>El círculo rojo indica el área permitida de {radius||100} metros.</small></div>;
}
