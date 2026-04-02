async function run() {
  const epciSiren = "200084950"; // Le Havre Seine Metropole
  const url1 = `https://www.geoportail-urbanisme.gouv.fr/api/document?siren=${epciSiren}`;
  
  const res = await fetch(url1);
  if (res.ok) {
     const data = await res.json();
     console.log("Documents for EPCI", epciSiren);
     for (const doc of data) {
         console.log("- ID:", doc.id, "Name:", doc.name, "Type:", doc.type, "Status:", doc.status, "Update:", doc.updateDate);
     }
  } else {
     console.log("Failed", res.status);
  }
}
run();
