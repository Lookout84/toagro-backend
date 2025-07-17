import axios from 'axios';

export interface LocationInfo {
  country?: string;
  region?: string;
  city?: string;
  district?: string;
  settlement?: string;
  displayName?: string;
  osmData?: any;
}

export async function reverseGeocode(lat: number, lon: number): Promise<LocationInfo> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'toagro-backend/1.0' },
      timeout: 5000
    });

    const address = data.address || {};
    
    return {
      country: address.country,
      region: address.state || address.region || address.county,
      city: address.city || address.town || address.village || address.hamlet,
      district: address.district || address.suburb,
      settlement: address.city || address.town || address.village || address.hamlet,
      displayName: data.display_name,
      osmData: data
    };
  } catch (error) {
    console.error('Помилка reverse geocoding:', error);
    throw new Error('Не вдалося виконати reverse geocoding');
  }
}