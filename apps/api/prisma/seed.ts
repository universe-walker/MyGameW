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
      const answersAccept = q.answersAccept ?? [];
      const answersReject = q.answersReject ?? [];
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

seed()
  .then(async () => {
    console.log('Seeded categories and questions');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
