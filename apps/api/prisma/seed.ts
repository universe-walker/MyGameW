import { PrismaClient, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();

// Source data provided by user
const data = {
  categories: [
    {
      title: 'Анатомия (базовая)',
      tags: ['anat', 'easy'],
      questions: [
        {
          value: 100,
          type: 'text',
          prompt: 'Сколько камер у сердца человека?',
          answersAccept: ['4', 'четыре'],
          answersReject: [],
          requireFull: false,
          language: 'ru',
          hint: 'Две предсердия, два желудочка',
        },
        {
          value: 200,
          type: 'word',
          prompt: 'Крупнейшая кость тела (одно слово)',
          answersAccept: ['бедренная', 'бедро'],
          canonicalAnswer: 'бедренная',
          hint: 'Нижняя конечность',
        },
        {
          value: 300,
          type: 'text',
          prompt: 'Орган, фильтрующий кровь и образующий мочу?',
          answersAccept: ['почка', 'почки'],
          requireFull: false,
        },
        {
          value: 400,
          type: 'text',
          prompt: 'Черепно-мозговой нерв, отвечающий за зрение (номер или название)?',
          answersAccept: ['ii', '2', 'зрительный', 'optic'],
          requireFull: false,
        },
        {
          value: 500,
          type: 'text',
          prompt: 'Канал в позвоночнике, через который проходит спинной мозг?',
          answersAccept: ['позвоночный канал', 'vertebral canal'],
        },
      ],
    },
    {
      title: 'Фармакология',
      tags: ['pharm'],
      questions: [
        {
          value: 100,
          type: 'text',
          prompt: 'Класс препаратов: ибупрофен, напроксен?',
          answersAccept: ['нпвс', 'нестероидные противовоспалительные', 'nsaids'],
        },
        {
          value: 200,
          type: 'word',
          prompt: 'Антагонист витамина K (одно слово)',
          answersAccept: ['варфарин', 'warfarin'],
          canonicalAnswer: 'варфарин',
        },
        {
          value: 300,
          type: 'text',
          prompt: 'Антидот при отравлении опиатами?',
          answersAccept: ['налоксон', 'naloxone'],
        },
        {
          value: 400,
          type: 'text',
          prompt: 'Макролид с активностью против атипичных?',
          answersAccept: ['азитромицин', 'clarithromycin', 'эритромицин'],
        },
        {
          value: 500,
          type: 'text',
          prompt: 'Токсичность аминогликозидов (назовите 2 побочки)',
          answersAccept: [
            'нефротоксичность ототоксичность',
            'ототоксичность нефротоксичность',
          ],
          requireFull: true,
        },
      ],
    },
    {
      "title": "Диагностика и инструментальные методы",
      "tags": ["diagnostics","imaging","easy"],
      "questions": [
        {
          "value": 100,
          "type": "text",
          "prompt": "Прибор для измерения артериального давления?",
          "answersAccept": ["тонометр","сфигмоманометр","sphygmomanometer"],
          "answersReject": ["фонендоскоп"],
          "requireFull": false,
          "language": "ru",
          "hint": "Манжета + грушa или автоприбор"
        },
        {
          "value": 200,
          "type": "word",
          "prompt": "УЗ-исследование сердца (одно слово)",
          "answersAccept": ["эхокардиография","эхокг","эхо-кг","echocardiography"],
          "canonicalAnswer": "эхокардиография",
          "hint": "Echo..."
        },
        {
          "value": 300,
          "type": "text",
          "prompt": "Анализ, отражающий средний уровень глюкозы за 2–3 месяца?",
          "answersAccept": ["гликированный гемоглобин","hba1c","hb a1c"],
          "requireFull": false,
          "language": "ru",
          "hint": "Hb…"
        },
        {
          "value": 400,
          "type": "text",
          "prompt": "Метод визуализации с послойными срезами и ионизирующим излучением?",
          "answersAccept": ["компьютерная томография","кт","computed tomography","ct"],
          "answersReject": ["мрт","ультразвук","узи"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 500,
          "type": "text",
          "prompt": "Исследование функции внешнего дыхания с форсированным выдохом?",
          "answersAccept": ["спирометрия","спирография","spirometry"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 600,
          "type": "word",
          "prompt": "Исследование сосудов с контрастом (одно слово)",
          "answersAccept": ["ангиография","angiography"],
          "canonicalAnswer": "ангиография",
          "hint": "Ангио-…"
        }
      ]
    },
    {
      "title": "Микробиология и инфекции",
      "tags": ["micro","id"],
      "questions": [
        {
          "value": 100,
          "type": "text",
          "prompt": "Возбудитель туберкулёза?",
          "answersAccept": ["микобактерия туберкулёза","mycobacterium tuberculosis","палочка коха","кокевая палочка— нет"], 
          "answersReject": ["бордетелла","стрептококк","стафилококк"],
          "requireFull": false,
          "language": "ru",
          "hint": "Палочка Коха"
        },
        {
          "value": 200,
          "type": "word",
          "prompt": "Кокк, вызывающий ангину и скарлатину (одно слово)",
          "answersAccept": ["стрептококк","streptococcus"],
          "canonicalAnswer": "стрептококк"
        },
        {
          "value": 300,
          "type": "text",
          "prompt": "Антибиотик выбора при сифилисе?",
          "answersAccept": ["пенициллин","benzathine penicillin","бензатиновый пенициллин"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 400,
          "type": "text",
          "prompt": "Основной путь передачи гепатита A?",
          "answersAccept": ["фекально-оральный","энтеральный","fecal-oral"],
          "answersReject": ["парентеральный","половой","воздушно-капельный"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 500,
          "type": "text",
          "prompt": "Препарат первой линии при туберкулёзе, вызывающий нейропатию при дефиците B6?",
          "answersAccept": ["изониазид","isoniazid","inh"],
          "requireFull": false,
          "language": "ru",
          "hint": "Комбинируют с пиридоксином"
        },
        {
          "value": 600,
          "type": "word",
          "prompt": "Род бактерий — возбудитель коклюша (одно слово)",
          "answersAccept": ["бордетелла","bordetella"],
          "canonicalAnswer": "бордетелла"
        }
      ]
    },
    {
      "title": "Патофизиология и симптомы",
      "tags": ["pathophys","symptoms"],
      "questions": [
        {
          "value": 100,
          "type": "text",
          "prompt": "Термин для ЧСС > 100/мин в покое?",
          "answersAccept": ["тахикардия","tachycardia"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 200,
          "type": "word",
          "prompt": "Снижение концентрации гемоглобина/эритроцитов (одно слово)",
          "answersAccept": ["анемия","anemia"],
          "canonicalAnswer": "анемия"
        },
        {
          "value": 300,
          "type": "text",
          "prompt": "Скопление жидкости в брюшной полости называется…",
          "answersAccept": ["асцит","ascites"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 400,
          "type": "text",
          "prompt": "Симптом — болезненная чувствительность к свету?",
          "answersAccept": ["фотофобия","светобоязнь","photophobia"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 500,
          "type": "text",
          "prompt": "Тип желтухи при массивном гемолизе?",
          "answersAccept": ["гемолитическая","надпеченочная","hemolytic"],
          "answersReject": ["печеночная","подпеченочная","механическая"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 600,
          "type": "word",
          "prompt": "Отсутствие мочи (< 100 мл/сут) (одно слово)",
          "answersAccept": ["анурия","anuria"],
          "canonicalAnswer": "анурия"
        }
      ]
    },
    {
      "title": "Неотложная помощь",
      "tags": ["er","emergency"],
      "questions": [
        {
          "value": 100,
          "type": "text",
          "prompt": "Препарат первой линии при анафилаксии (в/м)?",
          "answersAccept": ["адреналин","эпинефрин","epinephrine"],
          "answersReject": ["антигистаминные","стероиды"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 200,
          "type": "word",
          "prompt": "Восстановление проходимости дыхательных путей трубкой (одно слово)",
          "answersAccept": ["интубация","intubation"],
          "canonicalAnswer": "интубация"
        },
        {
          "value": 300,
          "type": "text",
          "prompt": "Антидот при передозировке бензодиазепинов?",
          "answersAccept": ["флумазенил","flumazenil"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 400,
          "type": "text",
          "prompt": "Препарат для коррекции тяжёлой гипогликемии при отсутствии венозного доступа (в/м/п/к)?",
          "answersAccept": ["глюкагон","glucagon"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 500,
          "type": "text",
          "prompt": "Средство для стабилизации кардиомембран при гиперкалиемии?",
          "answersAccept": ["кальция глюконат","кальция хлорид","calcium gluconate","calcium chloride"],
          "requireFull": false,
          "language": "ru"
        },
        {
          "value": 600,
          "type": "word",
          "prompt": "Устройство/приём для жёсткой компрессии кровотечения конечности (одно слово)",
          "answersAccept": ["турникет","жгут","tourniquet"],
          "canonicalAnswer": "турникет",
          "hint": "Англ. tourniquet"
        }
      ]
    }
  ],
};

function toQuestionType(v: string): QuestionType {
  if (v === 'word') return QuestionType.word;
  return QuestionType.text;
}

async function seed() {
  for (const cat of data.categories) {
    // Ensure category exists (upsert by title)
    const existing = await prisma.category.findUnique({ where: { title: cat.title } });
    let categoryId: string;
    if (!existing) {
      const created = await prisma.category.create({
        data: {
          title: cat.title,
          tags: cat.tags ?? [],
        },
      });
      categoryId = created.id;
    } else {
      categoryId = existing.id;
      // Clear existing questions to avoid duplicates on reseed
      await prisma.question.deleteMany({ where: { categoryId } });
      // Optionally update tags/title if changed
      await prisma.category.update({
        where: { id: categoryId },
        data: { title: cat.title, tags: cat.tags ?? [] },
      });
    }

    for (const q of cat.questions) {
      const answersAccept = (q as any).answersAccept ?? [];
      const answersReject = (q as any).answersReject ?? [];
      const canonical = (q as any).canonicalAnswer || answersAccept[0] || '';
      if (!canonical) {
        throw new Error(`Question '${q.prompt}' has no canonical answer or accept list`);
      }

      await prisma.question.create({
        data: {
          type: toQuestionType(q.type),
          prompt: q.prompt,
          rawAnswer: canonical,
          canonicalAnswer: canonical,
          value: q.value ?? 0,
          answersAccept,
          answersReject,
          requireFull: q.requireFull ?? false,
          language: (q as any).language ?? null,
          hint: (q as any).hint ?? null,
          categoryId,
        },
      });
    }
  }
}

// --- SuperQuestion seeding (test content) ---
async function seedSuperQuestionsMedical() {
  // Pick medical-related categories by tags
  const medCats = await prisma.category.findMany({ where: { tags: { hasSome: ['pharm', 'anat', 'med'] } } });
  if (medCats.length === 0) {
    console.log('No medical categories found by tags; skipping SuperQuestion seeding');
    return;
  }

  // Helper to get a question by value in category
  async function getBaseQuestion(catId: string, value: number) {
    return prisma.question.findFirst({ where: { categoryId: catId, value }, orderBy: { createdAt: 'asc' } });
  }

  // Collect up to 4 base questions: prefer values 200 and 400 across categories
  const targets: { categoryId: string; value: number; qId: string; correct: string }[] = [];
  for (const c of medCats) {
    for (const val of [200, 400]) {
      if (targets.length >= 4) break;
      const base = await getBaseQuestion(c.id, val);
      if (!base) continue;
      const correct = (base as any).canonicalAnswer || (base as any).rawAnswer || '';
      if (!correct) continue;
      // Avoid duplicates by questionId
      if (targets.some((t) => t.qId === base.id)) continue;
      targets.push({ categoryId: c.id, value: val, qId: base.id, correct: String(correct) });
    }
    if (targets.length >= 4) break;
  }
  if (targets.length === 0) {
    console.log('No base questions found for SuperQuestion seeding');
    return;
  }

  // Preload distractor pool (answers from other questions)
  const distractorPoolRaw = await prisma.question.findMany({
    take: 100,
    orderBy: { createdAt: 'asc' },
    select: { canonicalAnswer: true, rawAnswer: true },
  });
  const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const distractorPool = Array.from(
    new Set(
      distractorPoolRaw
        .map((q) => String((q as any).canonicalAnswer || (q as any).rawAnswer || ''))
        .filter((s) => !!s && s.trim().length > 0),
    ),
  );

  const createdIds: string[] = [];
  for (const t of targets) {
    // Skip if a SuperQuestion already exists for this base question
    const exists = await prisma.superQuestion.findFirst({ where: { questionId: t.qId } });
    if (exists) continue;

    // Build 3 distractors different from correct
    const correctNorm = normalize(t.correct);
    const distractors: string[] = [];
    const pool = distractorPool.filter((a) => normalize(a) !== correctNorm);
    while (distractors.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [pick] = pool.splice(idx, 1);
      if (distractors.every((d) => normalize(d) !== normalize(pick))) distractors.push(pick);
    }
    while (distractors.length < 3) distractors.push('—');
    const opts = [t.correct, ...distractors.slice(0, 3)];
    // Shuffle options
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const correctIndex = opts.findIndex((o) => normalize(o) === correctNorm);

    const sq = await prisma.superQuestion.create({
      data: {
        questionId: t.qId,
        enabled: true,
        options: opts as unknown as any, // Prisma Json type
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        locale: 'ru',
        tags: ['medical'],
      },
    });
    createdIds.push(sq.id);
  }
  console.log(`Seeded ${createdIds.length} SuperQuestion(s) [medical]`);
}

seed()
  .then(async () => {
    console.log('Seeded categories and questions');
    await seedSuperQuestionsMedical();
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
