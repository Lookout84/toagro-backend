import { prisma } from '../config/db';

const categories = [
  {
    name: 'Зернові',
    slug: 'cereals',
    description: 'Пшениця, ячмінь, жито, овес, кукурудза та інші зернові культури',
    children: [
      {
        name: 'Пшениця',
        slug: 'wheat',
        description: 'Різні сорти пшениці',
      },
      {
        name: 'Кукурудза',
        slug: 'corn',
        description: 'Кукурудза різних сортів',
      },
      {
        name: 'Ячмінь',
        slug: 'barley',
        description: 'Різні сорти ячменю',
      },
    ],
  },
  {
    name: 'Олійні',
    slug: 'oilseeds',
    description: 'Соняшник, ріпак, соя та інші олійні культури',
    children: [
      {
        name: 'Соняшник',
        slug: 'sunflower',
        description: 'Насіння та олія соняшника',
      },
      {
        name: 'Ріпак',
        slug: 'rapeseed',
        description: 'Ріпак озимий та ярий',
      },
      {
        name: 'Соя',
        slug: 'soybean',
        description: 'Соєві боби та продукти переробки',
      },
    ],
  },
  {
    name: 'Техніка та обладнання',
    slug: 'equipment',
    description: 'Сільськогосподарська техніка, обладнання та запчастини',
    children: [
      {
        name: 'Трактори',
        slug: 'tractors',
        description: 'Нові та вживані трактори різних марок',
      },
      {
        name: 'Комбайни',
        slug: 'combines',
        description: 'Зернозбиральні та інші комбайни',
      },
      {
        name: 'Сівалки',
        slug: 'seeders',
        description: 'Сівалки та посівне обладнання',
      },
      {
        name: 'Плуги та борони',
        slug: 'plows-harrows',
        description: 'Техніка для обробки ґрунту',
      },
    ],
  },
  {
    name: 'Добрива та ЗЗР',
    slug: 'fertilizers',
    description: 'Мінеральні та органічні добрива, засоби захисту рослин',
    children: [
      {
        name: 'Мінеральні добрива',
        slug: 'mineral-fertilizers',
        description: 'Азотні, фосфорні, калійні та комплексні добрива',
      },
      {
        name: 'Засоби захисту рослин',
        slug: 'plant-protection',
        description: 'Гербіциди, фунгіциди, інсектициди та інші ЗЗР',
      },
      {
        name: 'Органічні добрива',
        slug: 'organic-fertilizers',
        description: 'Гній, компост, біогумус та інші органічні добрива',
      },
    ],
  },
  {
    name: 'Насіння',
    slug: 'seeds',
    description: 'Насіння сільськогосподарських культур',
    children: [
      {
        name: 'Насіння зернових',
        slug: 'grain-seeds',
        description: 'Насіння пшениці, ячменю, кукурудзи та інших зернових',
      },
      {
        name: 'Насіння олійних',
        slug: 'oilseed-seeds',
        description: 'Насіння соняшника, ріпаку, сої та інших олійних',
      },
      {
        name: 'Насіння овочів',
        slug: 'vegetable-seeds',
        description: 'Насіння різних овочевих культур',
      },
    ],
  },
];

async function seedCategories() {
  console.log('Початок заповнення категорій...');

  for (const category of categories) {
    const { children, ...mainCategory } = category;
    
    // Створюємо головну категорію
    console.log(`Створюємо категорію: ${mainCategory.name}`);
    
    const parent = await prisma.category.upsert({
      where: { slug: mainCategory.slug },
      update: mainCategory,
      create: mainCategory,
    });
    
    // Створюємо підкатегорії
    if (children && children.length > 0) {
      for (const child of children) {
        console.log(`Створюємо підкатегорію: ${child.name}`);
        
        await prisma.category.upsert({
          where: { slug: child.slug },
          update: { ...child, parentId: parent.id },
          create: { ...child, parentId: parent.id },
        });
      }
    }
  }

  console.log('Заповнення категорій завершено');
}

// Виконуємо функцію заповнення і обробляємо помилки
seedCategories()
  .catch((error) => {
    console.error('Помилка під час заповнення категорій:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });