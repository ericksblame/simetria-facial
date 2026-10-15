// Recomendaciones por zona. Cada una dice qué hacer, cuánto y qué se puede esperar de forma realista.
// `pro: true` marca cuándo conviene un profesional.

export const GENERAL = [
  {
    title: 'Mastica por ambos lados',
    how: 'En cada comida, alterna conscientemente el lado con el que masticas. Si siempre usas el mismo porque el otro duele o te falta alguna pieza, empieza por el dentista.',
    effect: 'Puede equilibrar con los meses el tono de los músculos de la mandíbula. En adultos no cambia el hueso.',
  },
  {
    title: 'Duerme boca arriba (o alterna lados)',
    how: 'Usa una almohada que deje el cuello recto. Si no puedes dormir boca arriba, alterna el lado de una noche a otra.',
    effect: 'Evita apoyar la cara siempre sobre el mismo lado durante horas. La evidencia es limitada y el efecto, pequeño.',
  },
  {
    title: 'No apoyes la cara en la mano',
    how: 'Fíjate si apoyas la mejilla o el mentón en la mano al estar sentado, sobre todo frente a la pantalla.',
    effect: 'Quita una presión que se repite muchas horas. Por sí solo no corrige asimetrías ya establecidas.',
  },
  {
    title: 'Pantalla a la altura de los ojos',
    how: 'Sube el portátil o el monitor; sostén el móvil delante de la cara en vez de bajar la cabeza. No sujetes el teléfono con el hombro.',
    effect: 'Ayuda a la postura del cuello y la cabeza, que también influye en cómo se ve la cara.',
  },
];

export const BY_ZONE = {
  ojos: {
    intro: 'Una pequeña diferencia de altura o de apertura entre los ojos es muy común y suele ser ósea o de nacimiento.',
    items: [
      {
        title: 'Apertura controlada de párpados',
        how: 'Frente al espejo, cierra los ojos suavemente 2 s y ábrelos del todo sin subir las cejas. 10 repeticiones, 1–2 veces al día, buscando que ambos párpados se muevan igual.',
        effect: 'Mejora el control consciente del gesto. No cambia la forma del párpado ni la posición del ojo.',
      },
      {
        title: 'Revisa la vista',
        how: 'Si entrecierras más un ojo (al leer, con el sol o frente a la pantalla), una revisión de la vista y unas gafas de sol pueden quitar ese gesto repetido.',
        effect: 'Si la causa es forzar la vista, corregirla elimina el gesto que la mantiene.',
      },
      {
        title: 'Cuándo ir al médico',
        how: 'Si un párpado se ha caído hace poco, empeora a lo largo del día o ves doble, consúltalo con un médico, y de urgencia si ha sido repentino.',
        effect: 'Puede tener causas nerviosas o musculares que hay que valorar.',
        pro: true,
      },
    ],
  },
  cejas: {
    intro: 'La altura de las cejas depende mucho del hueso de la frente y de los gestos habituales (subir una ceja, fruncir un lado).',
    items: [
      {
        title: 'Elevación simétrica de cejas',
        how: 'Frente al espejo, sube las dos cejas despacio, mantén 3 s y baja. Si una sube más, intenta igualarlas con suavidad. 10 repeticiones al día.',
        effect: 'Ayuda a hacer el gesto más parejo. No cambia la posición de reposo de forma notable.',
      },
      {
        title: 'Relaja el entrecejo',
        how: 'Varias veces al día, comprueba si frunces o subes una ceja al concentrarte. Suelta la frente y respira.',
        effect: 'Reduce un gesto repetido que marca más un lado.',
      },
    ],
  },
  boca: {
    intro: 'Las comisuras dependen sobre todo de los músculos de la expresión, así que esta es la zona donde los ejercicios tienen algo más de margen (aunque sigue siendo poco).',
    items: [
      {
        title: 'Sonrisa simétrica frente al espejo',
        how: 'Sonríe despacio sin enseñar los dientes, buscando que las dos comisuras suban igual. Mantén 5 s y relaja. 10 repeticiones, 1–2 veces al día.',
        effect: 'Entrena el control del lado más débil. Cambia el gesto más que la cara en reposo.',
      },
      {
        title: 'Vocales «U–I»',
        how: 'Alterna «U» (labios hacia delante) e «I» (labios estirados) exagerando el movimiento y vigilando en el espejo que ambos lados se muevan igual. 15 repeticiones.',
        effect: 'Coordina los músculos de alrededor de la boca.',
      },
      {
        title: 'Mastica por ambos lados',
        how: 'Si la boca tira hacia un lado, ese suele ser también el lado con el que más masticas. Alterna en cada comida.',
        effect: 'Ayuda a equilibrar el tono muscular con el tiempo.',
      },
      {
        title: 'Urgencias si es repentino',
        how: 'Si una comisura se cae de golpe, no puedes cerrar un ojo o hablas con dificultad, llama a emergencias (112 / 911) sin esperar.',
        effect: 'Puede ser un ictus o una parálisis facial: el tiempo importa.',
        pro: true,
      },
    ],
  },
  mandibula: {
    intro: 'La forma de la mandíbula y la posición del mentón dependen sobre todo del hueso y de la mordida. Los hábitos solo influyen en el músculo (masetero).',
    items: [
      {
        title: 'Mastica alternando lados',
        how: 'Alterna en cada comida. Puedes añadir chicle sin azúcar 5–10 min en el lado que menos usas; para si te molesta la mandíbula.',
        effect: 'Puede igualar algo el volumen del músculo con los meses. No mueve el hueso.',
      },
      {
        title: 'Mandíbula en reposo',
        how: 'Lengua apoyada en el paladar, labios juntos y dientes ligeramente separados. Compruébalo varias veces al día, sobre todo si notas que aprietas.',
        effect: 'Reduce la tensión de apretar los dientes, que puede hacer un lado más voluminoso.',
      },
      {
        title: 'Apertura recta frente al espejo',
        how: 'Con la punta de la lengua en el paladar, abre la boca despacio vigilando que el mentón baje recto, sin irse a un lado. 10 repeticiones.',
        effect: 'Mejora el control del movimiento de la mandíbula.',
      },
      {
        title: 'Dentista u ortodoncista',
        how: 'Si aprietas o rechinas los dientes, la mandíbula hace ruido o duele, o la mordida cierra torcida, consulta a un dentista. Una desviación marcada del mentón se valora con un ortodoncista o un cirujano maxilofacial.',
        effect: 'Las causas óseas o dentales solo se corrigen con tratamiento profesional.',
        pro: true,
      },
    ],
  },
  nariz: {
    intro: 'Siendo honestos, la desviación de la nariz es casi siempre del tabique o del cartílago: ningún ejercicio ni hábito la cambia.',
    items: [
      {
        title: 'Respira por la nariz',
        how: 'Con la boca cerrada y la lengua en el paladar durante el día.',
        effect: 'Favorece una postura de reposo de la lengua y la mandíbula. No endereza la nariz.',
      },
      {
        title: 'Otorrino si hay síntomas',
        how: 'Si respiras peor por un lado, roncas mucho o tienes congestión frecuente, consulta a un otorrino.',
        effect: 'Un tabique desviado solo se corrige con tratamiento médico, y solo si da problemas.',
        pro: true,
      },
    ],
  },
  postura: {
    intro: 'Una inclinación puede ser solo de este momento. Si aparece en todas tus mediciones, puede ser un hábito postural del cuello.',
    items: [
      {
        title: 'Retracción del mentón (chin tuck)',
        how: 'Sentado y con la espalda recta, lleva la cabeza hacia atrás como haciendo «papada», sin bajar la mirada. Mantén 3 s. 10 repeticiones, 2–3 veces al día.',
        effect: 'Fortalece los músculos profundos del cuello y ayuda a llevar la cabeza más recta.',
      },
      {
        title: 'Estiramiento lateral del cuello',
        how: 'Lleva la oreja hacia el hombro contrario al lado al que te inclinas, sin subir el hombro. 20–30 s, 2 veces.',
        effect: 'Alivia la tensión del lado que tira.',
      },
      {
        title: 'Reparte la carga',
        how: 'Alterna el hombro con el que llevas bolso o mochila, y coloca la pantalla de frente, no a un lado.',
        effect: 'Quita la causa de muchas inclinaciones habituales.',
      },
    ],
  },
};
