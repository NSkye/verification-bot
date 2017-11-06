# Verification Bot
Необходимые зависимости: moment ^2.19.1; telegraf ^3.15.3

## Как работать
### Инициализация
```javascript
const VerificationBot = require('./libs/verification-bot');
const bot = new VerificationBot('/*ТОКЕН СЮДА В ВИДЕ СТРОКИ*/');
```
### События и методы
Бот общается с нашим сервером через события. На большинство из них требуется отвечать путем вызова какого-либо из методов бота.
#### bot.send(string, object)
Отправляет сообщение пользователю. В первом аргументе необходимо указать название используемого шаблона, во второмостальные необходимые параметры. 
Шаблоны:
- `message` -- дефолтный шаблон, так же будет использоваться если в этот аргумент передано название шаблона, которого нет, универсально может использоваться для отправки любых сообщений
- `code` -- шаблон для отправки кода используется когда мы отправляем боту код для подтверждения какой-либо операции
- `touch` -- шаблон для отправки кода и кнопки для мгновенного подтверждения, используется так же для подтверждения какой-либо операции, но более удобным способом, код всё равно мы передаем в качестве фоллбэка
###### Пример использования:
```javascript
bot.send('touch', { //Оба аргумента обязательны
  chatID: 31059467, //Обязательное поле для всех шаблонов
  code: 2128, //Обязательное поле для шаблонов message и touch
  operationID: 2, //Обязательное для шаблона touch
  message: 'SOME ACTION' //Обязательное поле для всех шаблонов
});
```
#### bot.on('user', callback)
Возвращает токен введенный пользователем и его chatID для того, чтоб мы могли ассоциировать пользователя из базы данных с соответствующим ему чатом.
###### Как обрабатывать:
```javascript
bot.on('user', (data) => {
  const {token, chatID} = data;
  /* Добавляем chatID пользователя в базу данных */
  bot.send('message', {chatID, message: 'Аккаунт привязан'}); //закрывать событие не нужно, но мы можем сообщить пользователю об успехе или провале операции
});
```
#### bot.on('operation', callback)
Событие появляется, когда один из пользователей подтвердил какую-либо операцию путем нажатия на кнопку
###### Как обрабатывать:
```javascript
bot.on('operation', (data) => {
  const { chatID, operationID } = data; //достаем из объекта id чата и id операции (его мы передали в событии send с шаблоном touch)
  /* Активируем ручку */
  data.text = 'Операция подтверждена'; //кладем в наш объект сообщение для пользователя
  bot.operation(data); //закрываем событие с помощью вызова этого метода и передачи ему модифицированного объекта
});
```
#### bot.on('publish_cards_request', callback)
Событие появляется, когда пользователь запросил список своих карт
###### Как обрабатывать:
```javascript
bot.on('publish_cards_request', (data) => {
  const { chatID } = data; //получаем из объекта chatID и находим по нему нужного пользователя в БД
  /* активируем ручку получения карт */
  data.cards = [ //добавляем карты к полученному объекту
    {
      id: 0,
      cardNumber: '0000',
      balance: 400000
    },
    {
      id: 1,
      cardNumber: '0001',
      balance: 999999
    }
  ];
  bot.publishCardsRequest(data); //отправляем модифицированный объект
});
```
#### bot.on('publish_transactions_request', callback)
Событие появляется, когда пользователь запросил список транзакций по карте
###### Как обрабатывать:
```javascript
bot.on('publish_transactions_request', (data) => {
  const { chatID, id } = data; //достаем из объекта id чата (chatID) и id карты (id)
  /* активируем ручку получения списка транзакций */
  data.operations = [ //модифицируем объект, добавляя к нему полученные транзакции
    {
        "data": "4561 2612 1234 5467",
        "type": "card2Card",
        "sum": 150,
        "id": 16,
        "cardId": 20,
        "time": "2017-10-12T16:09:57+03:00"
    },
    {
        "data": "+79218908064",
        "type": "paymentMobile",
        "sum": -15,
        "id": 17,
        "cardId": 19,
        "time": "2017-10-17T20:59:53+03:00"
    },
    {
        "data": "+79218908064",
        "type": "paymentMobile",
        "sum": -8,
        "id": 18,
        "cardId": 20,
        "time": "2017-10-17T20:59:59+03:00"
    }
  ];
  bot.publishOperationRequest(data); // закрываем событие, отправляя модифицированный объект обратно боту
});
```
#### bot.on('create_transaction', callback)
Событие происходит, когда пользователь решил создать транзакцию, закрытия не требует, но опять же можем отправить ему сообщение о том, что всё ок
###### Как обрабатывать:
```javascript
bot.on('create_transaction', (data) => {
  const { chatID, type, from, to, phone, amount } = data; //извлекаем из объекта данные для транзакции: from - id карты с которой переводим, to - id карты на которую переводим, если транзакция производится для мобильного, то to = null, вместо него будет заполнено поле phone и наоборот. amount - сумма перевода
  /* дергаем ручку создания транзакции */
  bot.send('message', {chatID, message: 'Операция бла-бла-бла обработана'}) //можем уведомить пользователя о том, что всё прошло хорошо
});
```
#### bot.on('sending_error', callback)
Событие появится, если у бота возникли проблемы с отправкой сообщения
###### Как обрабатывать:
```javascript
bot.on('sending_error', (log) => { //получаем объект ошибки
  console.log('sending_error:', log); //ну можем вывести его, что ещё остается-то
});
```
#### bot.on('create_card', callback)
Событие появляется, когда пользователь решил добавить карту через бота
###### Как обрабатывать:
```javascript
bot.on('create_card', (data) => {
  const { chatID, cardNumber } = data; //получаем id чата и номер новой карты
  /* дергаем ручку создания карты */
  bot.send('message', {chatID, message: 'Карта создана'}); //говорим пользователю, что всё прошло хорошо (либо плохо)
});
```
### bot.on('delete_card', callback)
Событие появляется, когда пользователь решил удалить карту через бота
###### Как обрабатывать:
```javascript
bot.on('delete_card, (data) => {
  const { chatID, id } = data; //получаем id чата и id удаляемой карты
  bot.send('message', {chatID, message: 'Карта удалена'}); //говорим пользователю как всё прошло
});
```
### bot.on('get_key', callback)
Планируется дать пользователю возможсть заблокировать некоторые функции бота, использовав придуманный им ключ, который может состоять из любых букв и цифр, данное событие появляется, когда боту требуется ключ, чтоб свериться с тем, что ввёл пользователь
###### Как обрабатывать:
```javascript
bot.on('get_key, (data) => {
  const { chatID } = data; //получаем id чата пользователя, находим его в БД и находим ассоциированный с ним ключ
  data.key = /* ключ который мы достали через ручку */
  bot.provideKey(data);
});
```
### bot.on('new_key', callback)
Событие появляется, когда пользователь хочет задать новый ключ или поменять старый
###### Как обрабатывать:
```javascript
bot.on('new_key, (data) => {
  const { chatID, newKey } = data; //получаем id чата пользователя, находим его в БД и находим ассоциированный с ним ключ
  /* выставляем новый ключ */
  bot.send('message', {chatID, message: 'Новый ключ установлен'});
});
```
## Что нужно сделать
###### Регистрация чата пользователя:
- В базе данных пользователю нужно добавить два необязательных поля: token:string и chatID:number
- На клиент добавить ручку, по которой клиент будет активировать бота
- После нажатия ручки, генерируется случайный четырехзначный токе, состоящий из цифр, токен передается пользователю и заносится в соответствующее поле в базе данных
- Пользователь отправляет токен боту, триггерится событие 'user', мы из него достаем chatID и token, ищем пользователя с таким токеном, забираем у него токен и присваиваем chatID
###### Неактивные транзакции:
- В базе данных добавить транзакциям два необязательных поля: pending:boolean и code:string
- Если бот активен и клиент на сайте производит какую-то транзакцию, ему должно показываться уведомление о необходимости подтверждения, в котором так же будет сгенерированный рандомный код, этот же код мы записываем в БД в новую транзакцию с атрибутом pending=true и отправляем боту в событии touch (или code) наряду с id созданной транзакции
- Получив событие operation или валидный код с клиента мы дописываем в транзакцию датувремя и меняем pending на false
- Желательно ещё по вебсокету триггернуть перезагрузку страницы, если пользователь подтвердил транзакцию кнопкой
