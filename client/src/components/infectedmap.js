import React, { useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import facility from '../assets/facility.svg';
import marker from '../assets/marker.svg';
import markerShadow from '../assets/marker-shadow.svg';
import 'leaflet/dist/leaflet.css';
import './modelmap.css';

const { Overlay } = LayersControl;

// Define custom icon
const customIcon = new L.Icon({
  iconUrl: facility,
  iconRetinaUrl: facility,
  iconSize: [36, 45],
  iconAnchor: [18, 45], // Half of icon's width and full height
});

const infectedPoint = new L.Icon({
  iconUrl: marker,
  shadowUrl:markerShadow,
  iconRetinaUrl: marker,
  iconSize: [36, 45],
  shadowRetinaUrl:markerShadow,
  shadowSize: [36, 45],
  iconAnchor: [18, 45], // Half of icon's width and full height
  shadowAnchor: [18, 45]
});

export default function InfectedMap({ infectedLatitude,infectedLongitude,mapZoom,infectedInfo }) {
 
  const [map, setMap] = useState(null);
  const [publicFacilities, setPublicFacilities] = useState([]);

  React.useEffect(() => {
    const L = require('leaflet');
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
      iconUrl: require('leaflet/dist/images/marker-icon.png'),
      shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    });
  }, []);

  // Function to create markers for public facilities
  const createFacilityMarker = (position, name) => {
    const marker = (
      <Marker position={position} icon={customIcon} zoomPanOptions={{ minZoom: 10, maxZoom: 18 }}>
        <Popup>{name}</Popup>
      </Marker>
    );
    return { marker, name };
  };

  // Function to update the group of public facilities
  const updatePublicFacilities = () => {
    const facilities = [
      createFacilityMarker([36.562036, -96.160775], "American Heritage Bank"),
      createFacilityMarker([36.562417, -96.161487], "Ascension Health"),
      createFacilityMarker([36.562665, -96.158863], "Assembly of God Church"),
      createFacilityMarker([36.545544, -96.165471], "Baptist Church"),
    ];
    setPublicFacilities(facilities);
  };

  // Call the function to update public facilities when the component mounts
  React.useEffect(() => {
    updatePublicFacilities();
  }, []);

  return (//36.562036, -96.160775 13
    <MapContainer center={[infectedLatitude,infectedLongitude]} zoom={mapZoom} className="mapcontainer" whenCreated={setMap}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Map">
          <TileLayer
            attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            //url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            url="https://server.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}.png"
          />
        </LayersControl.BaseLayer>
        <Overlay checked name="Public Facilities">
          {/* Render the markers for public facilities */}
          {infectedInfo==null&&publicFacilities.map(({ marker, name }) => (
            <LayersControl.Overlay key={name} name={name}>
              {marker}
            </LayersControl.Overlay>
          ))}
          {infectedInfo!=null&& 
             <>
             {Object.keys(infectedInfo).map(placeId => {
               const place = infectedInfo[placeId];
               // console.log(place.latitude, place.longitude,placeId,place.label);
                 <Marker position={[place.latitude, place.longitude]} icon={infectedPoint} zoomPanOptions={{ minZoom: 10, maxZoom: 18 }} key={placeId}>
                   <Popup>
                     <div>
                       <p>{place.label}</p>
                       <p>Capacity: {place.capacity}</p>
                     </div>
                   </Popup>
                 </Marker>
             })}  
           </> 
          }
        </Overlay>
      </LayersControl>
    </MapContainer>
  );
}