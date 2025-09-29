import { PrismaClient, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();

function toQuestionType(v: 'word' | 'text'): QuestionType {
  return v === 'word' ? QuestionType.word : QuestionType.text;
}

async function deleteCategoryQuestionsCascade(categoryId: string) {
  const questions = await prisma.question.findMany({ where: { categoryId }, select: { id: true } });
  if (questions.length === 0) return;
  const qIds = questions.map((q) => q.id);

  const supers = await prisma.superQuestion.findMany({ where: { questionId: { in: qIds } }, select: { id: true } });
  const sqIds = supers.map((s) => s.id);
  if (sqIds.length > 0) {
    await prisma.roomSuperCell.deleteMany({ where: { superQuestionId: { in: sqIds } } });
    await prisma.superQuestion.deleteMany({ where: { id: { in: sqIds } } });
  }

  await prisma.question.deleteMany({ where: { id: { in: qIds } } });
}

async function seedBlitzCategories() {
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
      title: 'Блиц: Эпонимы',
      tags: ['blitz', 'med'],
      questions: [
        {
          value: 100,
          type: 'word',
          prompt: `Какой эпоним соответствует сочетанию: арахнодактилия, эктопия хрусталика вверх-кнаружи, дилатация корня аорты?
A) Синдром Элерса—Данлоса
B) Синдром Кушинга
C) Синдром Марфана
D) Синдром Рейно`,
          answersAccept: ['синдром марфана', 'марфана', 'марфан', 'marfan', 'marfan syndrome'],
          canonicalAnswer: 'Синдром Марфана',
          language: 'ru',
        },
        {
          value: 200,
          type: 'word',
          prompt: `Какому эпониму соответствует триада: системное головокружение, флюктуирующая нейросенсорная тугоухость, шум в ухе?
A) Болезнь Меньера
B) Синдром Рейно
C) Болезнь Бехтерева
D) Болезнь Паркинсона`,
          answersAccept: ['болезнь меньера', 'меньера', 'meniere', "ménière", 'meniere disease'],
          canonicalAnswer: 'Болезнь Меньера',
          language: 'ru',
        },
        {
          value: 300,
          type: 'word',
          prompt: `Как называется психиатрический синдром убеждённости, что близкого человека подменили двойником?
A) Синдром Капгра
B) Синдром Котара
C) Синдром Туретта
D) Синдром Марфана`,
          answersAccept: ['синдром капгра', 'капгра', 'capgras', 'capgras syndrome'],
          canonicalAnswer: 'Синдром Капгра',
          language: 'ru',
        },
        {
          value: 400,
          type: 'word',
          prompt: `Какому эпониму соответствует хронический гранулематозный трансмуральный колит с «пропущенными» участками и свищами?
A) Болезнь Крона
B) Язвенный колит
C) Болезнь Вильсона
D) Болезнь Аддисона`,
          answersAccept: ['болезнь крона', 'крона', 'крон', 'crohn', 'crohn disease'],
          canonicalAnswer: 'Болезнь Крона',
          language: 'ru',
        },
      ],
    },
    {
      title: 'Клиническая психиатрия (Блиц)',
      tags: ['blitz', 'psy', 'med'],
      questions: [
        {
          value: 100,
          type: 'word',
          prompt: `Внезапный пик тревоги с выраженной вегетативной симптоматикой ≤10 минут, страх смерти. Что это?
A) Генерализованное тревожное расстройство
B) Социальная фобия
C) Паническая атака
D) Истерическое расстройство`,
          answersAccept: ['паническая атака', 'паническая', 'panic attack'],
          canonicalAnswer: 'Паническая атака',
          language: 'ru',
        },
        {
          value: 200,
          type: 'word',
          prompt: `После психотравмы: навязчивые воспоминания, избегание, гипервозбуждение более 1 месяца. Диагноз?
A) Острое стрессовое расстройство
B) ПТСР
C) Расстройство адаптации
D) Депрессивный эпизод`,
          answersAccept: [
            'птср',
            'посттравматическое стрессовое расстройство',
            'посттравматическое стрессовое',
            'ptsd',
            'post-traumatic stress disorder',
          ],
          canonicalAnswer: 'ПТСР',
          language: 'ru',
        },
        {
          value: 300,
          type: 'word',
          prompt: `Навязчивые мысли и ритуалы >1 часа в день, осознаются как собственные, вызывают дистресс. Диагноз?
A) ОКР
B) Шизотипическое расстройство
C) Генерализованное тревожное расстройство
D) Ипохондрическое расстройство`,
          answersAccept: [
            'окр',
            'обсессивно-компульсивное расстройство',
            'обсессивно компульсивное расстройство',
            'ocd',
            'obsessive compulsive disorder',
          ],
          canonicalAnswer: 'ОКР',
          language: 'ru',
        },
      ],
    },
    {
      title: 'Ятрогенные осложнения (Блиц)',
      tags: ['blitz', 'pharm', 'med'],
      questions: [
        {
          value: 100,
          type: 'word',
          prompt: `После курса клиндамицина: лихорадка, диарея, при колоноскопии — жёлтые налёты. Что произошло?
A) Язвенный колит
B) Псевдомембранозный колит
C) Синдром раздражённого кишечника
D) Ишемический колит`,
          answersAccept: [
            'псевдомембранозный колит',
            'pseudomembranous colitis',
            'c difficile',
            'c. difficile',
            'clostridioides difficile',
            'clostridium difficile',
          ],
          canonicalAnswer: 'Псевдомембранозный колит',
          language: 'ru',
        },
        {
          value: 200,
          type: 'word',
          prompt: `Первые дни терапии варфарином: болезненные пурпурные пятна, пузыри, участки некроза кожи. Осложнение?
A) Синдром Стивенса—Джонсона
B) Тромбоцитопеническая пурпура
C) Некроз кожи
D) Пурпура Шенлейна—Геноха`,
          answersAccept: ['некроз кожи', 'варфариновый некроз', 'warfarin skin necrosis', 'warfarin necrosis'],
          canonicalAnswer: 'Некроз кожи',
          language: 'ru',
        },
        {
          value: 300,
          type: 'word',
          prompt: `Длительный приём амиодарона: прогрессирующая одышка, сухой кашель, интерстициальные инфильтраты. Осложнение?
A) Обострение ХОБЛ
B) Саркоидоз
C) Фиброз лёгких
D) Бронхоэктазы`,
          answersAccept: [
            'фиброз лёгких',
            'фиброз легких',
            'амидарон-индуцированный пневмонит',
            'amiodarone pulmonary toxicity',
            'amiodarone pneumonitis',
          ],
          canonicalAnswer: 'Фиброз лёгких',
          language: 'ru',
        },
        {
          value: 400,
          type: 'word',
          prompt: `В/в бисфосфонаты: боль, свищ в области нижней челюсти, участок девитализированной кости. Осложнение?
A) Остеомиелит
B) Пародонтит
C) Остеонекроз челюсти
D) Артрит ВНЧС`,
          answersAccept: [
            'остеонекроз челюсти',
            'остеонекроз нижней челюсти',
            'бронж',
            'bronj',
            'medication related osteonecrosis of the jaw',
            'bisphosphonate related osteonecrosis of the jaw',
            'mrONJ',
            'brONJ',
          ],
          canonicalAnswer: 'Остеонекроз челюсти',
          language: 'ru',
        },
      ],
    },
    {
      title: 'Анатомия (Блиц)',
      tags: ['blitz', 'anat'],
      questions: [
        {
          value: 100,
          type: 'word',
          prompt: `Через какое отверстие выходит n. maxillaris (V2)?
A) Foramen ovale
B) Foramen rotundum
C) Foramen spinosum
D) Foramen jugulare`,
          answersAccept: ['foramen rotundum', 'круглое отверстие'],
          canonicalAnswer: 'Foramen rotundum',
          language: 'ru',
        },
        {
          value: 200,
          type: 'word',
          prompt: `Единственный абдуктор голосовых складок?
A) m. cricothyroideus
B) m. arytenoideus transversus
C) m. cricoarytenoideus posterior
D) m. thyroarytenoideus`,
          answersAccept: ['m. cricoarytenoideus posterior', 'задняя перстнечерпаловидная мышца'],
          canonicalAnswer: 'm. cricoarytenoideus posterior',
          language: 'ru',
        },
        {
          value: 300,
          type: 'word',
          prompt: `Что располагается кзади в lig. hepatoduodenale?
A) Ductus hepaticus communis
B) A. hepatica propria
C) V. portae hepatis
D) Ductus choledochus`,
          answersAccept: ['v. portae hepatis', 'воротная вена'],
          canonicalAnswer: 'V. portae hepatis',
          language: 'ru',
        },
        {
          value: 400,
          type: 'word',
          prompt: `От какой артерии чаще всего отходит ветвь к AV-узлу?
A) Левая коронарная артерия
B) Огибающая артерия
C) Правая коронарная артерия
D) Передняя межжелудочковая артерия`,
          answersAccept: ['правая коронарная артерия', 'right coronary artery', 'r. nodi atrioventricularis (RCA)'],
          canonicalAnswer: 'Правая коронарная артерия',
          language: 'ru',
        },
        {
          value: 500,
          type: 'word',
          prompt: `Куда впадает ductus thoracicus?
A) Правый венозный угол
B) Левый венозный угол
C) V. cava superior
D) Sinus coronarius`,
          answersAccept: ['левый венозный угол', 'angulus venosus sinister', 'левая венозная дуга'],
          canonicalAnswer: 'Левый венозный угол',
          language: 'ru',
        },
        {
          value: 600,
          type: 'word',
          prompt: `Повреждение какого нерва даёт симптом Тренделенбурга?
A) N. gluteus inferior
B) N. gluteus superior
C) N. femoralis
D) N. ischiadicus`,
          answersAccept: ['n. gluteus superior', 'верхний ягодичный нерв'],
          canonicalAnswer: 'N. gluteus superior',
          language: 'ru',
        },
        {
          value: 700,
          type: 'word',
          prompt: `Какая артерия проходит в «анатомической табакерке»?
A) A. ulnaris
B) A. radialis
C) A. interossea posterior
D) A. brachialis`,
          answersAccept: ['a. radialis', 'лучевая артерия', 'radial artery'],
          canonicalAnswer: 'A. radialis',
          language: 'ru',
        },
        {
          value: 800,
          type: 'word',
          prompt: `Что проходит через паховый канал у женщин?
A) Funiculus spermaticus
B) Lig. teres uteri
C) A. epigastrica inferior
D) N. femoralis`,
          answersAccept: ['lig. teres uteri', 'круглая связка матки', 'round ligament of uterus'],
          canonicalAnswer: 'Lig. teres uteri',
          language: 'ru',
        },
        {
          value: 900,
          type: 'word',
          prompt: `При переломе хирургической шейки плечевой кости чаще страдает?
A) N. medianus
B) N. radialis
C) N. axillaris
D) N. ulnaris`,
          answersAccept: ['n. axillaris', 'подмышечный нерв', 'axillary nerve'],
          canonicalAnswer: 'N. axillaris',
          language: 'ru',
        },
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
      await deleteCategoryQuestionsCascade(categoryId);
      await prisma.category.update({ where: { id: categoryId }, data: { title: cat.title, tags: cat.tags ?? [] } });
    }

    for (const q of cat.questions) {
      const accepts = q.answersAccept ?? [];
      const canonical = q.canonicalAnswer || accepts[0] || '';
      if (!canonical) continue;
      await prisma.question.create({
        data: {
          type: toQuestionType(q.type),
          prompt: q.prompt,
          rawAnswer: canonical,
          canonicalAnswer: canonical,
          value: q.value,
          answersAccept: accepts,
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

seedBlitzCategories()
  .then(async () => {
    console.log('Seeded blitz categories');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

