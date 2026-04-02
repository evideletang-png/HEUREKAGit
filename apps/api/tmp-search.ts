async function run() {
  const q = "Le Havre Seine Metropole";
  const url1 = `https://www.geoportail-urbanisme.gouv.fr/api/document/search?q=${encodeURIComponent(q)}`;
  
  const res = await fetch(url1);
  if (res.ok) {
     const data = await res.json();
     console.log("Documents matching", q);
     if (Array.isArray(data)) {
         for (const doc of data.slice(0, 10)) {
             console.log("- ID:", doc.id, "Name:", doc.name, "Type:", doc.type, "Status:", doc.status, "Update:", doc.updateDate);
         }
     } else {
         console.log(data);
     }
  } else {
     console.log("Failed", res.status);
  }
}
run();
