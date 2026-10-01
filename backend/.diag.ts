import { toCardDTO } from './src/models/card.model';
import { prisma } from './src/database/prisma';
(async () => {
  const c = await prisma.card.findFirst({ orderBy: { number: 'asc' } });
  const dto = toCardDTO(c);
  console.log('toCardDTO.imageUrl =', JSON.stringify(dto.imageUrl));
  const todos = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  const conUrl = todos.map(toCardDTO).filter((d) => d.imageUrl).length;
  console.log('cartas con imageUrl en el DTO:', conUrl, 'de', todos.length);
  await prisma.$disconnect();
})();
