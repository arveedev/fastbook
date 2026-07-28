/**
 * NFA PASSBOOK — Geographic Data Engine
 * Embedded PSGC dataset for Region V (Bicol Region).
 * Structure: REGION_DATA[regionCode] = { name, provinces: { provinceName: [municipalities...] } }
 * Extend this object with additional regions as the agency expands deployment.
 */
const REGION_DATA = {
  "V": {
    name: "Region V - Bicol Region",
    provinces: {
      "Albay": [
        "Bacacay", "Camalig", "Daraga", "Guinobatan", "Jovellar", "Legazpi City",
        "Libon", "Ligao City", "Malilipot", "Malinao", "Manito", "Oas",
        "Pio Duran", "Polangui", "Rapu-Rapu", "Santo Domingo", "Tabaco City", "Tiwi"
      ],
      "Camarines Norte": [
        "Basud", "Capalonga", "Daet", "Jose Panganiban", "Labo", "Mercedes",
        "Paracale", "San Lorenzo Ruiz", "San Vicente", "Santa Elena", "Talisay", "Vinzons"
      ],
      "Camarines Sur": [
        "Baao", "Balatan", "Bato", "Bombon", "Buhi", "Bula", "Cabusao", "Calabanga",
        "Camaligan", "Canaman", "Caramoan", "Del Gallego", "Gainza", "Garchitorena",
        "Goa", "Iriga City", "Lagonoy", "Libmanan", "Lupi", "Magarao", "Milaor",
        "Minalabac", "Nabua", "Naga City", "Ocampo", "Pamplona", "Pasacao", "Pili",
        "Presentacion", "Ragay", "Sagnay", "San Fernando", "San Jose", "Sipocot",
        "Siruma", "Tigaon", "Tinambac"
      ],
      "Catanduanes": [
        "Bagamanoc", "Baras", "Bato", "Caramoran", "Gigmoto", "Pandan",
        "Panganiban", "San Andres", "San Miguel", "Viga", "Virac"
      ],
      "Masbate": [
        "Aroroy", "Baleno", "Balud", "Batuan", "Cataingan", "Cawayan", "Claveria",
        "Dimasalang", "Esperanza", "Mandaon", "Masbate City", "Milagros", "Mobo",
        "Monreal", "Palanas", "Pio V. Corpuz", "Placer", "San Fernando",
        "San Jacinto", "San Pascual", "Uson"
      ],
      "Sorsogon": [
        "Barcelona", "Bulan", "Bulusan", "Casiguran", "Castilla", "Donsol", "Gubat",
        "Irosin", "Juban", "Magallanes", "Matnog", "Pilar", "Prieto Diaz",
        "Santa Magdalena", "Sorsogon City"
      ]
    }
  }
};

/** Returns provinces of a region, sorted ascending alphabetically. */
function getProvinces(regionCode) {
  const region = REGION_DATA[regionCode];
  if (!region) return [];
  return Object.keys(region.provinces).sort((a, b) => a.localeCompare(b));
}

/** Returns municipalities of a province in a region, sorted ascending alphabetically. */
function getMunicipalities(regionCode, province) {
  const region = REGION_DATA[regionCode];
  if (!region || !region.provinces[province]) return [];
  return [...region.provinces[province]].sort((a, b) => a.localeCompare(b));
}

/** Returns the human readable region name. */
function getRegionName(regionCode) {
  return REGION_DATA[regionCode] ? REGION_DATA[regionCode].name : regionCode;
}
