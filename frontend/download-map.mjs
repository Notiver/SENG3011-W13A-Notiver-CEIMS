import fs from 'fs';
import path from 'path';

const MAP_URL = "https://citydata.ada.unsw.edu.au/geoserver/geonode/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=geonode%3ALGAs_Sydney_and_surrounds&outputFormat=application%2Fjson";

// Set your destination inside the public folder
const TARGET_DIR = path.join(process.cwd(), 'public', 'data');
const TARGET_FILE = path.join(TARGET_DIR, 'sydney_lgas.json');

async function downloadMapData() {
  console.log("Initiating download from UNSW CityData...");

  try {
    // Ensure the directory exists
    if (!fs.existsSync(TARGET_DIR)) {
      fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    const response = await fetch(MAP_URL);
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Write the file to your public folder
    fs.writeFileSync(TARGET_FILE, JSON.stringify(data, null, 2));
    
    console.log(`Success! Map data saved to: ${TARGET_FILE}`);
  } catch (error) {
    console.error("Download failed:", error.message);
  }
}

downloadMapData();