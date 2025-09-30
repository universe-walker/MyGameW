// Extra categories supplied by user content (RU)
export type ExtraCategory = {
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
    hint?: string | null;
  }>;
};

export const extraCategories: ExtraCategory[] = [
  {
    title: 'Общие вопросы',
    tags: ['general', 'med'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Кого считают отцом медицины?', answersAccept: ['Гиппократ','Гиппократа','Hippocrates'] },
      { value: 100, type: 'text', prompt: 'Какова главная врачебная заповедь, сформулированная Гиппократом?', answersAccept: ['Не навреди','Не навреди!'] },
      { value: 100, type: 'word', prompt: 'Кому принадлежит фраза: «В мире не существует ядов и лекарств – все решает доза»?', answersAccept: ['Парацельс','Paracelsus'] },
      { value: 100, type: 'word', prompt: 'Какое заболевание бывает сахарным и несахарным?', answersAccept: ['Диабет'] },
      { value: 100, type: 'word', prompt: 'Какая врачебная специальность была у доктора Айболита?', answersAccept: ['Ветеринар','Ветеринарный врач'] },
      // 200
      { value: 200, type: 'word', prompt: 'Какое растение считалось целебным до середины XIX века, но сегодня признано опасным?', answersAccept: ['Табак'] },
      { value: 200, type: 'word', prompt: 'Название какого врача состоит из названий двух органов?', answersAccept: ['Отоларинголог','Оториноларинголог'] },
      { value: 200, type: 'word', prompt: 'Какую болезнь называли «чёрная смерть» в Средние века?', answersAccept: ['Чума'] },
      { value: 200, type: 'word', prompt: 'Как называется препарат из ослабленных/убитых возбудителей для прививок?', answersAccept: ['Вакцина'] },
      // 300
      { value: 300, type: 'word', prompt: 'Какое слово с латыни буквально переводится как «терпящий»?', answersAccept: ['Пациент','patient'] },
      { value: 300, type: 'word', prompt: 'Лечебное учреждение для стационарных больных от греческого «постель». Название?', answersAccept: ['Клиника'] },
      { value: 300, type: 'word', prompt: 'Наука о лечении болезней без хирургического вмешательства.', answersAccept: ['Терапия'] },
      { value: 300, type: 'word', prompt: 'Какой врач никогда не спрашивает: «Что у вас болит?»', answersAccept: ['Ветеринар'] },
      // 400
      { value: 400, type: 'word', prompt: 'Мышечная перегородка между грудной и брюшной полостями.', answersAccept: ['Диафрагма'] },
      { value: 400, type: 'word', prompt: 'Чего у младенца больше, чем у взрослого?', answersAccept: ['Костей','кости'] },
      { value: 400, type: 'word', prompt: 'Фамилия изобретателя зубной пасты.', answersAccept: ['Колгейт','Colgate'] },
      { value: 400, type: 'text', prompt: 'Кто изобрёл первый антибиотик — пенициллин?', answersAccept: ['Александр Флеминг','Флеминг','Alexander Fleming'] },
    ],
  },
  {
    title: 'Вакцины',
    tags: ['med','vaccines'],
    questions: [
      { value: 100, type: 'text', prompt: 'Какие учёные открыли вакцину от туберкулёза?', answersAccept: ['Кальметт и Герен','Кальмет и Герен','BCG','Calmette and Guerin'] },
      { value: 200, type: 'text', prompt: 'Кто впервые разработал вакцину от бубонной чумы?', answersAccept: ['Владимир Хавкин','Хавкин','Haffkine'] },
      { value: 300, type: 'text', prompt: 'Кто создал первую вакцину от натуральной оспы?', answersAccept: ['Эдвард Дженнер','Дженнер','Jenner'] },
    ],
  },
  {
    title: 'Анатомия',
    tags: ['anat'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Трубчатая кость состоит из эпифиза и ...', answersAccept: ['Диафиза','Диафиз'] },
      { value: 100, type: 'text', prompt: 'Позвоночный столб состоит из ... позвонков.', answersAccept: ['32-34','32','33','34'] },
      // 200
      { value: 200, type: 'word', prompt: 'Неокостеневший участок свода черепа у новорождённых.', answersAccept: ['Родничок','родничок'] },
      { value: 200, type: 'text', prompt: 'Запястье состоит из ... костей.', answersAccept: ['8','восемь','восьми'] },
      // 300
      { value: 300, type: 'text', prompt: 'Плевра состоит из двух листков: каких?', answersAccept: ['Висцеральный и париетальный','Париетальный и висцеральный','висцеральная и париетальная'] },
      { value: 300, type: 'text', prompt: 'Предплюсна стопы человека состоит из ... костей.', answersAccept: ['7','семь','семи'] },
      // 400
      { value: 400, type: 'word', prompt: 'Головной мозг состоит из белого и ... вещества.', answersAccept: ['Серого','серого'] },
      { value: 400, type: 'text', prompt: 'Базальные ядра: хвостатое, чечевицеобразное, ограда и ...', answersAccept: ['Миндалевидное тело','Амигдала'] },
    ],
  },
  {
    title: 'Анатомия (доп.)',
    tags: ['anat'],
    questions: [
      { value: 100, type: 'text', prompt: 'Система мозговых артерий на основании мозга, названная в честь Томаса Уиллиса.', answersAccept: ['Виллизиев круг','Круг Виллизия','Willis circle'] },
      { value: 200, type: 'text', prompt: 'Патологическая венозная сеть на брюшной стенке при портальной гипертензии.', answersAccept: ['Голова медузы','caput medusae'] },
      { value: 300, type: 'text', prompt: 'Лимфоэпителиальное кольцо: как называется кольцо из миндалин?', answersAccept: ['Пирогова-Вальдейера','Кольцо Пирогова-Вальдейера'] },
    ],
  },
  {
    title: 'Терапия',
    tags: ['ther'],
    questions: [
      // 100
      { value: 100, type: 'text', prompt: 'Вакцинацию от гриппа проводят ...', answersAccept: ['Каждый год','Ежегодно','1 раз в год'] },
      { value: 100, type: 'word', prompt: 'Прибор для измерения артериального давления.', answersAccept: ['Тонометр'] },
      { value: 100, type: 'word', prompt: 'Состояние со снижением гемоглобина и эритроцитов.', answersAccept: ['Анемия'] },
      // 200
      { value: 200, type: 'text', prompt: 'Кашель 3 месяца не менее 2 лет подряд указывает на ...', answersAccept: ['Хронический бронхит','бронхит хронический'] },
      { value: 200, type: 'word', prompt: 'Прибор для прослушивания звуков организма.', answersAccept: ['Фонендоскоп','Стетоскоп'] },
      { value: 200, type: 'word', prompt: 'Сгусток крови в просвете сосуда или полости сердца.', answersAccept: ['Тромб'] },
      // 300
      { value: 300, type: 'text', prompt: 'Соотношение компрессий и вдохов при СЛР у взрослых.', answersAccept: ['30:2','30-2','30 к 2','30 2'] },
      { value: 300, type: 'word', prompt: 'Глубокое нарушение сознания с отсутствием реакции.', answersAccept: ['Кома'] },
      { value: 300, type: 'word', prompt: 'Разрушение эритроцитов с высвобождением гемоглобина.', answersAccept: ['Гемолиз'] },
      // 400
      { value: 400, type: 'text', prompt: 'Универсальные реципиенты имеют ... группу крови.', answersAccept: ['Четвёртую','четвертую','4','AB','AB (IV)','IV'] },
      { value: 400, type: 'text', prompt: 'Универсальные доноры имеют ... группу крови.', answersAccept: ['Первую','первую','1','O','I'] },
      { value: 400, type: 'word', prompt: 'Острое инфекционное заболевание лёгких.', answersAccept: ['Пневмония'] },
    ],
  },
  {
    title: 'Эндокринология',
    tags: ['endo'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Основной мужской половой гормон.', answersAccept: ['Тестостерон'] },
      { value: 100, type: 'word', prompt: 'Основной женский половой гормон.', answersAccept: ['Эстрадиол'] },
      { value: 100, type: 'text', prompt: 'Хроническое заболевание с нарушением обмена глюкозы.', answersAccept: ['Сахарный диабет','Диабет'] },
      // 200
      { value: 200, type: 'word', prompt: 'Препарат первой линии при СД 2.', answersAccept: ['Метформин'] },
      { value: 200, type: 'word', prompt: 'Хроническое заболевание с избыточным накоплением жира.', answersAccept: ['Ожирение'] },
      { value: 200, type: 'text', prompt: 'Кратность HbA1c при СД в год.', answersAccept: ['Каждые 3 месяца','Раз в квартал','4 раза в год'] },
      // 300
      { value: 300, type: 'text', prompt: 'Нарушение реабсорбции воды в почках: диагноз.', answersAccept: ['Несахарный диабет'] },
      { value: 300, type: 'word', prompt: 'Избыток тиреоидных гормонов: диагноз.', answersAccept: ['Тиреотоксикоз','Гипертиреоз'] },
      { value: 300, type: 'word', prompt: 'Дефицит гормонов щитовидной железы: диагноз.', answersAccept: ['Гипотиреоз'] },
      // 400
      { value: 400, type: 'word', prompt: 'Радионуклидный метод визуализации органов.', answersAccept: ['Сцинтиграфия'] },
      { value: 400, type: 'word', prompt: 'Снижение костной массы и микроструктуры кости.', answersAccept: ['Остеопороз'] },
      { value: 400, type: 'text', prompt: 'Тяжёлое заболевание при гиперпродукции АКТГ аденомой гипофиза.', answersAccept: ['Болезнь Иценко-Кушинга','Иценко-Кушинга'] },
    ],
  },
  {
    title: 'Эндокринология (доп.)',
    tags: ['endo'],
    questions: [
      { value: 100, type: 'word', prompt: 'Пролактин вырабатывается преимущественно передней долей ...', answersAccept: ['Гипофиза'] },
      { value: 200, type: 'word', prompt: 'Эстрогены при беременности вырабатываются ...', answersAccept: ['Плацентой'] },
      { value: 300, type: 'word', prompt: 'У мужчин часть тестостерона синтезируется в ...', answersAccept: ['Надпочечниках'] },
    ],
  },
  {
    title: 'Хирургия',
    tags: ['surg'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Очаговое гнойное воспаление с полостью, заполненной гноем.', answersAccept: ['Абсцесс'] },
      { value: 100, type: 'text', prompt: 'Разлитое гнойное воспаление клетчатки с быстрым распространением.', answersAccept: ['Флегмона'] },
      { value: 100, type: 'text', prompt: 'Пористый материал в виде губки для гемостаза.', answersAccept: ['Гемостатическая губка'] },
      // 200
      { value: 200, type: 'word', prompt: 'Соединение между сосудами или полыми органами.', answersAccept: ['Анастомоз'] },
      { value: 200, type: 'word', prompt: 'Удаление части органа.', answersAccept: ['Резекция'] },
      { value: 200, type: 'word', prompt: 'Замещение тканей/органов от донора или ауто.', answersAccept: ['Трансплантация'] },
      // 300
      { value: 300, type: 'word', prompt: 'Метод взятия образца ткани для микроскопии.', answersAccept: ['Биопсия'] },
      { value: 300, type: 'word', prompt: 'Комплекс мер для предупреждения микробов при манипуляциях.', answersAccept: ['Асептика'] },
      { value: 300, type: 'word', prompt: 'Система мероприятий по уничтожению микробов в очаге.', answersAccept: ['Антисептика'] },
      // 400
      { value: 400, type: 'word', prompt: 'Принцип в онкохирургии, предотвращающий рецидив и метастазы.', answersAccept: ['Абластика'] },
      { value: 400, type: 'word', prompt: 'Триада Мондора: вздутие, боль и ...', answersAccept: ['Рвоту','рвоту'] },
      { value: 400, type: 'word', prompt: 'Симптомы: Щёткина-Блюмберга, Воскресенского и ...', answersAccept: ['Менделя'] },
    ],
  },
  {
    title: 'Хирургия (доп.)',
    tags: ['surg'],
    questions: [
      { value: 100, type: 'word', prompt: 'Операция по изменению формы носа.', answersAccept: ['Ринопластика'] },
      { value: 200, type: 'word', prompt: 'Удаление локальных жировых отложений.', answersAccept: ['Липосакция'] },
      { value: 300, type: 'word', prompt: 'Коррекция формы/положения ушных раковин.', answersAccept: ['Отопластика'] },
    ],
  },
  {
    title: 'История медицины',
    tags: ['history','med'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'В Древнем Египте анатомические знания получали при ...', answersAccept: ['Бальзамировании','Бальзамирование'] },
      { value: 100, type: 'word', prompt: 'Процедура лечебного извлечения крови.', answersAccept: ['Кровопускание'] },
      { value: 100, type: 'word', prompt: 'Знаменитое лечебное мероприятие на Руси.', answersAccept: ['Баня'] },
      // 200
      { value: 200, type: 'word', prompt: 'Центром жизни в Индии считали ...', answersAccept: ['Пупок'] },
      { value: 200, type: 'word', prompt: 'Парацельс уделял особое внимание изучению ...', answersAccept: ['Химии','Химия'] },
      { value: 200, type: 'word', prompt: 'Изучение анатомии на замороженных трупах впервые применил ...', answersAccept: ['Пирогов'] },
      // 300
      { value: 300, type: 'word', prompt: 'Закон наследственности открыл ...', answersAccept: ['Мендель'] },
      { value: 300, type: 'word', prompt: 'Древнейший критерий человека.', answersAccept: ['Прямохождение'] },
      { value: 300, type: 'word', prompt: 'Заразная болезнь времён крестовых походов.', answersAccept: ['Проказа'] },
      // 400
      { value: 400, type: 'word', prompt: 'Основоположник военно-полевой хирургии в России.', answersAccept: ['Пирогов'] },
      { value: 400, type: 'text', prompt: 'Открыл явление фагоцитоза, основы клеточной теории иммунитета (Нобель 1908).', answersAccept: ['Мечников'] },
      { value: 400, type: 'word', prompt: 'Создатель учения о высшей нервной деятельности.', answersAccept: ['Павлов'] },
    ],
  },
  {
    title: 'История медицины (доп.)',
    tags: ['history','med'],
    questions: [
      { value: 100, type: 'text', prompt: 'Операция первобытных людей для изгнания злого духа.', answersAccept: ['Трепанацию черепа','трепанация черепа'] },
      { value: 200, type: 'word', prompt: 'Первыми, посвятившими себя медицине как профессии, были ...', answersAccept: ['Шаманы'] },
      { value: 300, type: 'word', prompt: 'Мудров одним из первых применял перкуссию и ...', answersAccept: ['Аускультацию','аускультацию'] },
    ],
  },
  {
    title: 'Урология',
    tags: ['uro'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Воспалительное заболевание предстательной железы.', answersAccept: ['Простатит'] },
      { value: 100, type: 'word', prompt: 'Воспалительный процесс мочевого пузыря.', answersAccept: ['Цистит'] },
      { value: 100, type: 'word', prompt: 'Парный орган фасолевидной формы в поясничной области.', answersAccept: ['Почка','Почки'] },
      // 200
      { value: 200, type: 'word', prompt: 'Инфекционно-воспалительное заболевание почки.', answersAccept: ['Пиелонефрит'] },
      { value: 200, type: 'word', prompt: 'Отложение в почках нерастворимого белка — амилоида.', answersAccept: ['Амилоидоз'] },
      { value: 200, type: 'word', prompt: 'Отсутствие мочи в мочевом пузыре.', answersAccept: ['Анурия'] },
      // 300
      { value: 300, type: 'word', prompt: 'Полная задержка мочеиспускания.', answersAccept: ['Ишурия'] },
      { value: 300, type: 'word', prompt: 'Тактика при перекруте яичка.', answersAccept: ['Оперативная','Операция'] },
      { value: 300, type: 'text', prompt: 'Основное направление диеты при ХПН.', answersAccept: ['Малобелковая диета'] },
      // 400
      { value: 400, type: 'word', prompt: 'Куда чаще всего метастазирует рак простаты?', answersAccept: ['Кости','в кости'] },
      { value: 400, type: 'word', prompt: 'Наличие в эякуляте только клеток сперматогенеза.', answersAccept: ['Азооспермия'] },
      { value: 400, type: 'word', prompt: 'Отсутствие в эякуляте сперматозоидов и клеток сперматогенеза.', answersAccept: ['Аспермия'] },
    ],
  },
  {
    title: 'Урология (доп.)',
    tags: ['uro'],
    questions: [
      { value: 100, type: 'word', prompt: 'Воспаление крайней плоти и головки полового члена.', answersAccept: ['Баланопостит'] },
      { value: 200, type: 'text', prompt: 'Классическая триада: гематурия, пальпируемое образование, боль в пояснице — характерна для ...', answersAccept: ['Рака почки','рак почки'] },
      { value: 300, type: 'word', prompt: 'Аномалия развития с полным отсутствием обоих яичек.', answersAccept: ['Анорхизм'] },
    ],
  },
  {
    title: 'Неврология',
    tags: ['neuro'],
    questions: [
      // 100
      { value: 100, type: 'word', prompt: 'Существует два вида инсульта: ишемический и ...', answersAccept: ['Геморрагический'] },
      { value: 100, type: 'text', prompt: 'Отмирание участка мозга из-за нарушения кровоснабжения.', answersAccept: ['Ишемический инсульт'] },
      { value: 100, type: 'text', prompt: 'Острое кровоизлияние в мозг вследствие разрыва сосуда.', answersAccept: ['Геморрагический инсульт'] },
      // 200
      { value: 200, type: 'text', prompt: 'Основной симптом при обострении поясничного остеохондроза.', answersAccept: ['Боль в пояснице'] },
      { value: 200, type: 'word', prompt: 'Ощущение “треска” в шее при поворотах головы характерно для ...', answersAccept: ['Остеохондроз'] },
      { value: 200, type: 'text', prompt: 'Транспортировка больных с ОНМК.', answersAccept: ['Лежа на спине','в положении лёжа','лежа'] },
      // 300
      { value: 300, type: 'word', prompt: 'Антидот при отравлении метиловым спиртом.', answersAccept: ['Этиловый спирт','этанол'] },
      { value: 300, type: 'text', prompt: 'Основное проявление неврита лицевого нерва.', answersAccept: ['Перекос лица','асимметрия лица'] },
      { value: 300, type: 'word', prompt: 'Основная структурно-функциональная единица НС.', answersAccept: ['Нейрон'] },
      // 400
      { value: 400, type: 'word', prompt: 'Дисфагия при поражении пар черепных нервов ...', answersAccept: ['9-10','IX-X','девять-десять'] },
      { value: 400, type: 'word', prompt: 'Птоз при поражении черепного нерва ...', answersAccept: ['Третьего','III'] },
      { value: 400, type: 'word', prompt: 'Статика зависит от деятельности какого отдела мозга?', answersAccept: ['Мозжечок'] },
    ],
  },
  {
    title: 'Неврология (доп.)',
    tags: ['neuro'],
    questions: [
      { value: 100, type: 'word', prompt: 'Самый крупный нерв человеческого тела.', answersAccept: ['Седалищный'] },
      { value: 200, type: 'text', prompt: 'Для лечения диабетической полинейропатии показана ...', answersAccept: ['Тиоктовая кислота','альфа-липоевая кислота'] },
      { value: 300, type: 'word', prompt: 'Нарушение узнавания при сохранной чувствительности и сознании.', answersAccept: ['Агнозия'] },
    ],
  },
  {
    title: 'Кардиология',
    tags: ['cardio'],
    questions: [
      // 100
      { value: 100, type: 'text', prompt: 'Острое состояние с некрозом миокарда.', answersAccept: ['Инфаркт миокарда'] },
      { value: 100, type: 'text', prompt: 'Хроническое поражение артерий с отложением холестерина.', answersAccept: ['Атеросклероз'] },
      { value: 100, type: 'text', prompt: 'Очень высоким по шкале SCORE считается риск более ... %', answersAccept: ['10','10%'] },
      // 200
      { value: 200, type: 'text', prompt: 'Статины отменяют при трансаминазах выше нормы в ... раза.', answersAccept: ['3','три'] },
      { value: 200, type: 'text', prompt: 'Целевой уровень АД в популяции < ... мм рт.ст.', answersAccept: ['140/90','140 90','140-90'] },
      { value: 200, type: 'word', prompt: 'Тест изменения положения тела для оценки ССС.', answersAccept: ['Ортостатическая проба'] },
      // 300
      { value: 300, type: 'word', prompt: 'Препараты выбора при АГ у пациентов с подагрой.', answersAccept: ['Сартаны','БРА','ангиотензин II рецепторов блокаторы'] },
      { value: 300, type: 'text', prompt: 'Первая доза бисопролола при СН (мг).', answersAccept: ['1.25','1,25'] },
      { value: 300, type: 'word', prompt: 'Рентгеноконтрастное исследование сосудов сердца.', answersAccept: ['Коронарография'] },
      // 400
      { value: 400, type: 'word', prompt: 'Воспаление стенок крупных артерий (аорты и ветвей).', answersAccept: ['Болезнь Такаясу','Такаясу'] },
      { value: 400, type: 'word', prompt: 'При дислипидемии 4-го типа резко повышены ...', answersAccept: ['ЛПОНП','VLDL','ВЛДЛ'] },
      { value: 400, type: 'text', prompt: 'Макрофаги, переполненные водонерастворимыми липидами.', answersAccept: ['Пенистые клетки'] },
    ],
  },
  {
    title: 'Кардиология (доп.)',
    tags: ['cardio'],
    questions: [
      { value: 100, type: 'word', prompt: 'Стенокардия ФК: приступы при ходьбе >500 м → ФК?', answersAccept: ['2','второй'] },
      { value: 200, type: 'text', prompt: 'Стенокардия ФК: 100–500 м, подъём на 1 этаж → ФК?', answersAccept: ['3','третий'] },
      { value: 300, type: 'text', prompt: 'Стенокардия ФК: менее 100 м, в покое → ФК?', answersAccept: ['4','четвёртый','четвертый'] },
    ],
  },
];
