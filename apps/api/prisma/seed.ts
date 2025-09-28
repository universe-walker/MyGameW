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

async function deleteCategoryQuestionsCascade(categoryId: string) {
  // Collect questions in the category
  const questions = await prisma.question.findMany({ where: { categoryId }, select: { id: true } });
  if (questions.length === 0) return;
  const qIds = questions.map((q) => q.id);

  // Collect SuperQuestions linked to these questions
  const supers = await prisma.superQuestion.findMany({ where: { questionId: { in: qIds } }, select: { id: true } });
  const sqIds = supers.map((s) => s.id);

  // Delete RoomSuperCells that reference those SuperQuestions
  if (sqIds.length > 0) {
    await prisma.roomSuperCell.deleteMany({ where: { superQuestionId: { in: sqIds } } });
    await prisma.superQuestion.deleteMany({ where: { id: { in: sqIds } } });
  }

  // Finally delete questions in this category
  await prisma.question.deleteMany({ where: { id: { in: qIds } } });
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
      // Clear existing questions to avoid duplicates on reseed (handle FKs)
      await deleteCategoryQuestionsCascade(categoryId);
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

// --- User-provided medical categories/questions (RU) ---
async function seedUserProvided() {
  const categories: Array<{
    title: string;
    tags?: string[];
    questions: Array<{
      value: number;
      type: 'word' | 'text';
      prompt: string;
      answersAccept: string[];
      canonicalAnswer?: string;
      requireFull?: boolean;
      language?: string;
    }>;
  }> = [
    {
      title: 'Этика и право',
      tags: ['med', 'ethics'],
      questions: [
        { value: 100, type: 'word', prompt: 'Как называется право пациента отказаться от лечения после информирования?', answersAccept: ['информированный отказ'], canonicalAnswer: 'информированный отказ', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Как называется обязанность врача хранить сведения о пациенте?', answersAccept: ['медицинская тайна'], canonicalAnswer: 'медицинская тайна', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Как называется принцип уважения самостоятельных решений пациента?', answersAccept: ['принцип автономии'], canonicalAnswer: 'принцип автономии', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Как называется обязанность действовать в интересах пациента?', answersAccept: ['принцип благодеяния'], canonicalAnswer: 'принцип благодеяния', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Как называется лицо, уполномоченное принимать решения за недееспособного?', answersAccept: ['законный представитель'], canonicalAnswer: 'законный представитель', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Как называется ситуация, допускающая помощь без согласия из-за угрозы жизни?', answersAccept: ['экстренная ситуация'], canonicalAnswer: 'экстренная ситуация', language: 'ru' },
        { value: 500, type: 'word', prompt: 'Как называется принцип равного распределения ресурсов по клинической потребности?', answersAccept: ['принцип справедливости'], canonicalAnswer: 'принцип справедливости', language: 'ru' },
        { value: 500, type: 'word', prompt: 'Как называется юридический статус общей способности к сделкам и решениям?', answersAccept: ['дееспособность'], canonicalAnswer: 'дееспособность', language: 'ru' },
      ],
    },
    {
      title: 'Анатомия (без фото, только описание)',
      tags: ['anat', 'med'],
      questions: [
        { value: 100, type: 'word', prompt: 'Двустворчатый клапан между левым предсердием и левым желудочком.', answersAccept: ['valva mitralis'], canonicalAnswer: 'valva mitralis', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Крупнейшая паренхиматозная железа брюшной полости', answersAccept: ['hepar'], canonicalAnswer: 'hepar', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Продолжение a. axillaris; идёт по медиальной борозде плеча; даёт a. profunda brachii.', answersAccept: ['arteria brachialis'], canonicalAnswer: 'arteria brachialis', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Единственная кость плечевого пояса, сочленяется с рукояткой грудины и акромионом.', answersAccept: ['clavicula'], canonicalAnswer: 'clavicula', language: 'ru' },
        { value: 300, type: 'word', prompt: 'Складка брюшины с «портальной триадой»: ductus hepaticus communis, v. portae, a. hepatica propria.', answersAccept: ['ligamentum hepatoduodenale'], canonicalAnswer: 'ligamentum hepatoduodenale', language: 'ru' },
        { value: 300, type: 'word', prompt: 'Сфинктер, регулирующий опорожнение желудка в двенадцатиперстную кишку.', answersAccept: ['sphincter pylori'], canonicalAnswer: 'sphincter pylori', language: 'ru' },
      ],
    },
    {
      title: 'Фармакология: механизм действия',
      tags: ['pharm', 'med'],
      questions: [
        // Пропущено: нет ответа у пользователя
        // { value: 200, type: 'word', prompt: 'Основной антикоагулянтный эффект НМГ — преимущественная инактивация какого фактора?', answersAccept: ['фактор Ха'], canonicalAnswer: 'фактор Ха', language: 'ru' },
      ],
    },
    {
      title: 'Ятрогенные осложнения',
      tags: ['pharm', 'complications', 'med'],
      questions: [
        { value: 100, type: 'word', prompt: 'Длительный приём НПВП; желудочное кровотечение, положительный тест на скрытую кровь. Назовите осложнение.', answersAccept: ['язва желудка'], canonicalAnswer: 'язва желудка', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Терапия опиоидами; снижение перистальтики, твёрдый стул. Назовите осложнение.', answersAccept: ['запор'], canonicalAnswer: 'запор', language: 'ru' },
        { value: 100, type: 'word', prompt: 'ИАПФ используется для лечения артериальной гипертензии. Назовите самое частое осложнение при использовании данного препарата?', answersAccept: ['сухой кашель'], canonicalAnswer: 'сухой кашель', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Тиазидный диуретик; слабость, аритмия, низкий K⁺ в сыворотке. Назовите осложнение.', answersAccept: ['гипокалиемия'], canonicalAnswer: 'гипокалиемия', language: 'ru' },

        { value: 200, type: 'word', prompt: 'Метформин при сахарном диабете; тахипноэ, высокий лактат без гипоксии. Назовите осложнение.', answersAccept: ['лактатацидоз'], canonicalAnswer: 'лактатацидоз', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Бета-блокатор у пациента с бронхиальной астмой; свистящее дыхание, экспираторная одышка. Назовите осложнение.', answersAccept: ['бронхоспазм'], canonicalAnswer: 'бронхоспазм', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Аминогликозид; рост креатинина, цилиндрурия. Назовите осложнение.', answersAccept: ['нефротоксичность'], canonicalAnswer: 'нефротоксичность', language: 'ru' },

        { value: 300, type: 'word', prompt: 'Фторхинолон у пожилого пациента; внезапная боль в ахилловой области, дефект при пальпации. Назовите осложнение.', answersAccept: ['разрыв сухожилия'], canonicalAnswer: 'разрыв сухожилия', language: 'ru' },
        { value: 300, type: 'word', prompt: 'Статин в высокой дозе; миалгии, высокий КФК, тёмная моча. Назовите осложнение.', answersAccept: ['рабдомиолиз'], canonicalAnswer: 'рабдомиолиз', language: 'ru' },

        { value: 400, type: 'word', prompt: 'Метотрексат; бледность, инфекции, тромбоцитопения, угнетена функция костного мозга. Назовите осложнение.', answersAccept: ['панцитопения'], canonicalAnswer: 'панцитопения', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Спиронолактон у мужчины; болезненность и увеличение молочных желёз. Назовите осложнение.', answersAccept: ['гинекомастия'], canonicalAnswer: 'гинекомастия', language: 'ru' },

        { value: 500, type: 'word', prompt: 'Петлевой диуретик в высоких дозах; снижение слуха, шум в ушах, обратимая глухота. Назовите осложнение.', answersAccept: ['ототоксичность'], canonicalAnswer: 'ототоксичность', language: 'ru' },
      ],
    },
    {
      title: 'Клиническая психиатрия',
      tags: ['psych', 'med'],
      questions: [
        { value: 100, type: 'word', prompt: 'Острый приступ интенсивной тревоги с вегетативными симптомами (пик ≤10 минут), страх смерти. Назовите состояние.', answersAccept: ['паническая атака'], canonicalAnswer: 'паническая атака', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Сниженное настроение ≥2 недель, ангедония, утомляемость, идеи вины. Назовите эпизод.', answersAccept: ['депрессивный эпизод'], canonicalAnswer: 'депрессивный эпизод', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Через 2–3 суток абстиненции: тремор, дезориентация, зоогаллюцинации, вегетатика. Назовите состояние.', answersAccept: ['алкогольный делирий'], canonicalAnswer: 'алкогольный делирий', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Выраженный страх оценки и внимания окружающих, избегание публичных ситуаций. Назовите расстройство.', answersAccept: ['социальная фобия'], canonicalAnswer: 'социальная фобия', language: 'ru' },

        { value: 200, type: 'word', prompt: 'Навязчивые мысли и ритуалы, занимающие >1 часа в день, осознаются как свои. Назовите расстройство.', answersAccept: ['обсессивно-компульсивное расстройство'], canonicalAnswer: 'обсессивно-компульсивное расстройство', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Пережитая травма; навязчивые воспоминания, избегание, гипервозбуждение >1 месяца. Назовите расстройство.', answersAccept: ['посттравматическое стрессовое расстройство'], canonicalAnswer: 'посттравматическое стрессовое расстройство', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Дефицит массы, искажённый образ тела, ограничение питания, аменорея. Назовите расстройство.', answersAccept: ['анорексия нервная'], canonicalAnswer: 'анорексия нервная', language: 'ru' },

        { value: 300, type: 'word', prompt: 'Непоколебимая убеждённость в преследовании при сохранной логике вне бредовой темы. Назовите вид бреда.', answersAccept: ['бред преследования'], canonicalAnswer: 'бред преследования', language: 'ru' },
        { value: 300, type: 'word', prompt: 'Множественные моторные тики и вокализации, начало в детстве, длительность >1 года. Назовите синдром.', answersAccept: ['синдром Туретта'], canonicalAnswer: 'синдром Туретта', language: 'ru' },
        { value: 300, type: 'word', prompt: 'В первые две недели после родов — бред, галлюцинации, дезорганизация поведения. Назовите состояние.', answersAccept: ['послеродовый психоз'], canonicalAnswer: 'послеродовый психоз', language: 'ru' },

        { value: 400, type: 'word', prompt: 'Убеждённость, что близкого человека подменили двойником-обманщиком. Назовите синдром.', answersAccept: ['синдром Капгра'], canonicalAnswer: 'синдром Капгра', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Нигилистический бред: отрицание существования органов, себя, мира. Назовите синдром.', answersAccept: ['синдром Котара'], canonicalAnswer: 'синдром Котара', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Мучительное внутреннее беспокойство и потребность двигаться, часто на фоне нейролептика. Назовите состояние.', answersAccept: ['акатизия'], canonicalAnswer: 'акатизия', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Чувство отчуждения собственного «Я», воспринимаемое как постороннее. Назовите феномен.', answersAccept: ['деперсонализация'], canonicalAnswer: 'деперсонализация', language: 'ru' },

        { value: 500, type: 'word', prompt: 'Застывание в неудобной позе с сохранением приданной позы длительно. Назовите симптом.', answersAccept: ['каталепсия'], canonicalAnswer: 'каталепсия', language: 'ru' },
        { value: 500, type: 'word', prompt: 'У хронического алкоголизма — полиморфные слуховые галлюцинации при ясном сознании. Назовите состояние.', answersAccept: ['алкогольный галлюциноз'], canonicalAnswer: 'алкогольный галлюциноз', language: 'ru' },
      ],
    },
    {
      title: 'Эпонимы',
      tags: ['eponyms', 'med'],
      questions: [
        { value: 100, type: 'word', prompt: 'Двигательная триада: тремор покоя, ригидность, брадикинезия; гипомимия, микрография. Назовите болезнь.', answersAccept: ['болезнь Паркинсона'], canonicalAnswer: 'болезнь Паркинсона', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Хронический гиперкортицизм: лунообразное лицо, пурпурные стрии, проксимальная миопатия. Назовите синдром.', answersAccept: ['синдром Кушинга'], canonicalAnswer: 'синдром Кушинга', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Воспалительная боль в спине, двусторонний сакроилиит, ограничение грудной экскурсии. Назовите болезнь.', answersAccept: ['болезнь Бехтерева'], canonicalAnswer: 'болезнь Бехтерева', language: 'ru' },
        { value: 100, type: 'word', prompt: 'Разгибание большого пальца стопы при штриховом раздражении подошвы. Назовите симптом.', answersAccept: ['симптом Бабинского'], canonicalAnswer: 'симптом Бабинского', language: 'ru' },

        { value: 200, type: 'word', prompt: 'Трифазная смена окраски пальцев на холод: бледность, цианоз, гиперемия. Назовите синдром.', answersAccept: ['синдром Рейно'], canonicalAnswer: 'синдром Рейно', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Приступы системного головокружения, флюктуирующая нейросенсорная тугоухость, шум в ухе. Назовите болезнь.', answersAccept: ['болезнь Меньера'], canonicalAnswer: 'болезнь Меньера', language: 'ru' },
        { value: 200, type: 'word', prompt: 'Гиперпигментация кожных складок, гипонатриемия, гиперкалиемия, низкий кортизол. Назовите болезнь.', answersAccept: ['болезнь Аддисона'], canonicalAnswer: 'болезнь Аддисона', language: 'ru' },

        { value: 300, type: 'word', prompt: 'Трансмуральное сегментарное гранулематозное воспаление ЖКТ, «пропущенные» участки, свищи. Назовите болезнь.', answersAccept: ['болезнь Крона'], canonicalAnswer: 'болезнь Крона', language: 'ru' },

        { value: 400, type: 'word', prompt: 'Боль и сопротивление при разгибании голени при согнутом бедре. Назовите симптом.', answersAccept: ['симптом Кернига'], canonicalAnswer: 'симптом Кернига', language: 'ru' },
        { value: 400, type: 'word', prompt: 'Резкая болезненность при быстром отнятии руки от брюшной стенки. Назовите симптом.', answersAccept: ['симптом Блюмберга'], canonicalAnswer: 'симптом Блюмберга', language: 'ru' },
      ],
    },
  ];

  for (const cat of categories) {
    const existing = await prisma.category.findUnique({ where: { title: cat.title } });
    let categoryId: string;
    if (!existing) {
      const created = await prisma.category.create({ data: { title: cat.title, tags: cat.tags ?? [] } });
      categoryId = created.id;
    } else {
      categoryId = existing.id;
      // Replace questions for this category on reseed to avoid duplicates (handle FKs)
      await deleteCategoryQuestionsCascade(categoryId);
      await prisma.category.update({ where: { id: categoryId }, data: { title: cat.title, tags: cat.tags ?? [] } });
    }

    for (const q of cat.questions) {
      const answersAccept = q.answersAccept ?? [];
      const canonical = q.canonicalAnswer || answersAccept[0] || '';
      if (!canonical) continue; // skip incomplete entries
      await prisma.question.create({
        data: {
          type: toQuestionType(q.type),
          prompt: q.prompt,
          rawAnswer: canonical,
          canonicalAnswer: canonical,
          value: q.value,
          answersAccept,
          answersReject: [],
          requireFull: q.requireFull ?? false,
          language: q.language ?? 'ru',
          hint: null,
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
    // Include user-provided medical categories
    await seedUserProvided();
    await seedSuperQuestionsMedical();
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
