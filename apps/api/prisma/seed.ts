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
