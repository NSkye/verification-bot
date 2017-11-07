const VerificationBot = require('./libs/verification-bot');

const bot = new VerificationBot('488153596:AAH9E0WA1l32rOIp04kPGYagL6090VBh8pc');
bot.on('sending_error', (log) => {
  console.log('sending_error:', log);
});
bot.on('user', (data) => {
  const {token, chatID} = data;
  console.log('user:', data);
  bot.send('message', {chatID, message: 'Аккаунт привязан'});
});
bot.on('operation', (data) => {
  const { chatID } = data;
  console.log('operation:', data);
  data.text = 'Операция подтверждена';
  bot.operation(data);
});
bot.on('publish_cards_request', (data) => {
  const { chatID } = data;
  data.cards = [
    {
      id: 0,
      cardNumber: '4561 2612 1234 5467',
      balance: 16516
    },
    {
      id: 1,
      cardNumber: '4916 0447 1091 2927',
      balance: 15878
    }
  ];
  bot.publishCardsRequest(data);
});
bot.on('publish_transactions_request', (data) => {
  const { chatID, id } = data;
  data.operations = [
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
  bot.publishOperationRequest(data);
});
bot.on('create_card', (data) => {
  const { chatID, cardNumber } = data;
  bot.send('message', {chatID, message: 'Карта добавлена'})
});
bot.on('delete_card', (data) => {
  const { chatID, id } = data;
  bot.send('message', {chatID, message: 'Карта удалена'})
});
bot.send('touch', {
  chatID: 31059467,
  code: 2128,
  operationID: 2,
  message: 'Подтвердите транзакцию по карте на сумму 10р.'
});
