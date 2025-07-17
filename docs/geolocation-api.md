# API для створення оголошень з геолокацією

## Опис
Реалізовано можливість створення оголошень (listings) з автоматичним визначенням місцезнаходження товару через:
1. **Геолокацію користувача** - координати автоматично надходять з браузера користувача
2. **Вибір на карті** - користувач може вибрати конкретне місце розташування товару на карті

## Алгоритм роботи

### Пріоритет вибору координат:
1. **Найвищий пріоритет**: координати з карти (`mapLocation`) - якщо користувач вибрав конкретне місце на карті
2. **Другий пріоритет**: геолокація користувача (`userGeolocation`) - якщо місце на карті не вибрано

### Reverse Geocoding
Після отримання координат (з карти або геолокації) система автоматично виконує reverse geocoding для визначення:
- Країни
- Регіону (область)
- Району
- Населеного пункту
- Адресної інформації

## API Endpoints

### POST /api/listings
Створення нового оголошення з геолокацією

#### Параметри тіла запиту:

```json
{
  "title": "Назва товару",
  "description": "Опис товару",
  "price": 1000,
  "currency": "UAH",
  "categoryId": 1,
  "condition": "new",
  
  // Геолокація користувача (опціонально)
  "userGeolocation": {
    "latitude": "50.4501",
    "longitude": "30.5234"
  },
  
  // Дані з карти OpenStreetMap (опціонально, має пріоритет)
  "mapLocation": {
    "lat": "50.4501",
    "lon": "30.5234",
    "name": "Київ",
    "display_name": "Київ, Україна",
    "osm_id": 421866,
    "osm_type": "relation",
    "place_id": 97524521,
    "addresstype": "city",
    "boundingbox": ["50.2130539", "50.5916077", "30.2394734", "30.8256283"],
    "address": {
      "city": "Київ",
      "state": "Київська область",
      "country": "Україна"
    }
  },
  
  // Альтернативний спосіб - прямо вказати локацію (для сумісності)
  "location": {
    "countryId": 1,
    "settlement": "Київ",
    "latitude": 50.4501,
    "longitude": 30.5234,
    "region": "Київська область"
  }
}
```

### PUT /api/listings/:id
Оновлення оголошення з можливістю зміни геолокації

Приймає ті ж параметри, що і POST запит.

## Приклади використання

### 1. Створення оголошення з геолокацією користувача

```javascript
const formData = new FormData();
formData.append('title', 'Трактор John Deere');
formData.append('description', 'Чудовий стан');
formData.append('price', '50000');
formData.append('currency', 'UAH');
formData.append('categoryId', '1');

// Отримуємо геолокацію користувача
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition((position) => {
    formData.append('userGeolocation', JSON.stringify({
      latitude: position.coords.latitude.toString(),
      longitude: position.coords.longitude.toString()
    }));
    
    // Відправляємо запит
    fetch('/api/listings', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: formData
    });
  });
}
```

### 2. Створення оголошення з вибором місця на карті

```javascript
const formData = new FormData();
formData.append('title', 'Комбайн Claas');
formData.append('description', 'Відмінний стан');
formData.append('price', '120000');

// Користувач вибрав місце на карті (данні з Nominatim/OpenStreetMap)
const selectedLocation = {
  lat: "49.2331",
  lon: "28.4682",
  name: "Вінниця",
  display_name: "Вінниця, Вінницька область, Україна",
  osm_id: 421866,
  address: {
    city: "Вінниця",
    state: "Вінницька область",
    country: "Україна"
  }
};

formData.append('mapLocation', JSON.stringify(selectedLocation));

fetch('/api/listings', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token
  },
  body: formData
});
```

### 3. Використання обох варіантів (пріоритет має mapLocation)

```javascript
const formData = new FormData();
formData.append('title', 'Сівалка');

// Геолокація користувача
formData.append('userGeolocation', JSON.stringify({
  latitude: "50.4501",
  longitude: "30.5234"
}));

// Місце вибране на карті (буде використане з пріоритетом)
formData.append('mapLocation', JSON.stringify({
  lat: "49.2331",
  lon: "28.4682",
  name: "Вінниця"
}));

// Система використає координати з mapLocation (49.2331, 28.4682)
// а не з userGeolocation
```

## Структура Location в базі даних

```sql
CREATE TABLE "Location" (
  "id" SERIAL PRIMARY KEY,
  "countryId" INTEGER,
  "country" TEXT,
  "region" TEXT,
  "district" TEXT,
  "settlement" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "osmId" INTEGER,
  "osmType" TEXT,
  "placeId" INTEGER,
  "displayName" TEXT,
  "addressType" TEXT,
  "boundingBox" TEXT[],
  "osmJsonData" JSONB
);
```

## Логування

Система логує всі дії пов'язані з геолокацією:

```
[INFO] Використано координати з карти для товару
[INFO] Використано геолокацію користувача для товару  
[INFO] Виконано reverse geocoding для координат (50.4501, 30.5234): {
  country: "Україна",
  region: "Київська область", 
  district: "Печерський район",
  settlement: "Київ",
  source: "map_selection"
}
```

## Помилки та їх обробка

### Геолокація недоступна
Якщо геолокація користувача недоступна, система працюватиме без координат або використає дані з карти.

### Помилка reverse geocoding
Якщо reverse geocoding не вдається, система збереже тільки координати без адресної інформації.

### Некоректні координати
Система валідує координати та відхиляє запити з некоректними значеннями.
