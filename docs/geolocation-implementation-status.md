# Тест API геолокації оголошень

## Опис проекту

Ви успішно реалізували систему створення оголошень з підтримкою геолокації! 

## Що було зроблено:

### 1. **Розширено модель Location**
- Додано підтримку OSM (OpenStreetMap) полів
- Додано поля для reverse geocoding
- Оновлено схему Prisma

### 2. **Оновлено listingController.ts**
- Додано логіку вибору між геолокацією користувача та вибором на карті
- Реалізовано автоматичний reverse geocoding
- Додано підтримку mapLocation (дані з карти)
- Додано підтримку userGeolocation (геолокація користувача)

### 3. **Покращено geocodingService.ts**
- Розширено інтерфейс LocationInfo
- Додано обробку помилок
- Додано таймаут для запитів

## Логіка роботи:

### Пріоритет координат:
1. **Найвищий пріоритет**: `mapLocation` - якщо користувач вибрав місце на карті
2. **Другий пріоритет**: `userGeolocation` - геолокація користувача
3. **Резервний**: плоскі поля location для сумісності

### Автоматичний reverse geocoding:
- Для отриманих координат система автоматично виконує reverse geocoding
- Визначає країну, регіон, район, населений пункт
- Зберігає дані в таблиці Location

## Приклади запитів:

### 1. Створення оголошення з геолокацією користувача:
```bash
curl -X POST http://localhost:5000/api/listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Трактор John Deere",
    "description": "Відмінний стан",
    "price": 50000,
    "currency": "UAH",
    "categoryId": 1,
    "condition": "used",
    "userGeolocation": {
      "latitude": "50.4501",
      "longitude": "30.5234"
    }
  }'
```

### 2. Створення оголошення з вибором на карті:
```bash
curl -X POST http://localhost:5000/api/listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Комбайн Claas",
    "description": "Гарний стан",
    "price": 120000,
    "currency": "UAH",
    "categoryId": 1,
    "condition": "used",
    "mapLocation": {
      "lat": "49.2331",
      "lon": "28.4682",
      "name": "Вінниця",
      "display_name": "Вінниця, Вінницька область, Україна",
      "osm_id": 421866,
      "address": {
        "city": "Вінниця",
        "state": "Вінницька область",
        "country": "Україна"
      }
    }
  }'
```

### 3. Створення з обома варіантами (mapLocation має пріоритет):
```bash
curl -X POST http://localhost:5000/api/listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Сівалка",
    "description": "Новий стан",
    "price": 25000,
    "currency": "UAH",
    "categoryId": 1,
    "condition": "new",
    "userGeolocation": {
      "latitude": "50.4501",
      "longitude": "30.5234"
    },
    "mapLocation": {
      "lat": "49.2331",
      "lon": "28.4682",
      "name": "Вінниця"
    }
  }'
```
(В цьому випадку будуть використані координати з Вінниці, а не Києва)

## Логи системи:

При створенні оголошення ви побачите логи типу:
```
[INFO] Використано координати з карти для товару
[INFO] Виконано reverse geocoding для координат (49.2331, 28.4682): {
  country: "Україна",
  region: "Вінницька область", 
  district: "",
  settlement: "Вінниця",
  source: "map_selection"
}
[INFO] Оголошення з ID 123 успішно створено
```

## Схема бази даних:

Таблиця Location тепер містить:
- `id` - унікальний ідентифікатор
- `countryId` - ID країни
- `country` - назва країни 
- `region` - область/регіон
- `district` - район
- `settlement` - населений пункт (обов'язкове)
- `latitude`, `longitude` - координати
- OSM поля: `osmId`, `osmType`, `placeId`, `displayName`, `addressType`, `boundingBox`, `osmJsonData`

## Наступні кроки:

1. **Фронтенд інтеграція**: 
   - Додати геолокацію в браузері
   - Інтегрувати карту для вибору місць
   - Додати UI для вибору між геолокацією та картою

2. **Розширена функціональність**:
   - Пошук оголошень за радіусом від координат
   - Фільтрація за географічними областями
   - Автозаповнення адрес

3. **Оптимізація**:
   - Кешування результатів geocoding
   - Batch обробка геолокації
   - Валідація координат

## Статус: ✅ ЗАВЕРШЕНО

Система створення оголошень з геолокацією повністю реалізована та готова до використання!
