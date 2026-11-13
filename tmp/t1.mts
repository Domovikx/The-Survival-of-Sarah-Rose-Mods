const s = "Я останусь здесь, даже если это будет означать риск для моей жизни.".toLowerCase();
console.log("len", s.length, "idx", s.indexOf("анус"));
for (const t of ["анус","означ"]) console.log(t, s.indexOf(t));
console.log(JSON.stringify(s));
