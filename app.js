document.addEventListener('DOMContentLoaded', function () {
  var greeting = document.getElementById('tg-user');
  var tg = window.Telegram && window.Telegram.WebApp;

  if (!tg) {
    console.log('Telegram Web App не найден. Откройте страницу внутри Telegram.');
    return;
  }

  tg.ready();
  tg.expand();

  var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
  var name = user && (user.first_name || user.username)
    ? (user.first_name || user.username)
    : 'гость';

  console.log('Пользователь Telegram:', user || null);
  greeting.textContent = 'Привет, ' + name;

  document.getElementById('dog-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(event.target).entries());
    data.vaccinated = event.target.vaccinated.checked;
    console.log('Анкета собаки:', data);
    greeting.textContent = 'Анкета заполнена. Сохранение в базу будет на следующем шаге.';
  });
});
