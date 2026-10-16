document.addEventListener('DOMContentLoaded', function () {
  var account = rememberAccount();
  var greeting = document.getElementById('tg-user');
  var profileUser = document.getElementById('profile-user');
  var status = document.getElementById('form-status');
  var form = document.getElementById('dog-form');
  var feed = document.getElementById('dog-feed');
  var tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  if (document.body.getAttribute('data-requires-dog') === '1') {
    document.body.classList.add('is-checking');
    fetchMyDog().then(function (data) {
      if (data && data.ok === true && data.has_dog) {
        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        document.body.classList.remove('is-checking');
        return;
      }
      if (data && data.ok === true) {
        window.location.replace('index.html');
        return;
      }
      document.body.classList.remove('is-checking');
      showGateError();
    });
  }

  if (greeting) {
    if (account.firstName) {
      greeting.textContent = 'Привет, ' + account.firstName;
    } else if (!account.inTelegram) {
      greeting.textContent = 'Откройте приложение в Telegram';
    }
  }

  if (profileUser) {
    profileUser.textContent = account.firstName
      ? ('Владелец: ' + account.firstName)
      : 'Откройте приложение в Telegram, чтобы увидеть имя.';
  }

  var locateButton = document.getElementById('locate-btn');
  var coordsText = document.getElementById('coords-text');
  var manualCoords = document.getElementById('manual-coords');
  var latInput = document.getElementById('lat');
  var lonInput = document.getElementById('lon');
  var latManual = document.getElementById('lat-manual');
  var lonManual = document.getElementById('lon-manual');

  if (locateButton) {
    locateButton.addEventListener('click', getUserLocation);
  }

  if (latManual && lonManual) {
    latManual.addEventListener('input', syncManualCoords);
    lonManual.addEventListener('input', syncManualCoords);
  }

  if (feed) {
    feed.addEventListener('click', onLikeClick);
    var matchClose = document.getElementById('match-close');
    if (matchClose) {
      matchClose.addEventListener('click', function () {
        document.getElementById('match-modal').classList.remove('is-visible');
      });
    }
    loadFeed();
  }

  var chatBox = document.getElementById('chat-messages');
  if (chatBox) {
    initChat(chatBox);
  }

  var walkForm = document.getElementById('walk-form');
  if (walkForm) {
    initWalk(walkForm);
  }

  var reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    initReview(reviewForm);
  }

  var homeMenu = document.getElementById('home-menu');
  var homeRetry = document.getElementById('home-retry');
  if (homeMenu) {
    if (homeRetry) {
      homeRetry.addEventListener('click', loadHome);
    }
    loadHome();
  }

  if (!form) {
    return;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var submitButton = form.querySelector('button[type="submit"]');
    syncManualCoords();
    var payload = {
      name: form.name.value.trim(),
      breed: form.breed.value.trim(),
      weight_kg: form.weight_kg.value,
      activity: form.activity.value,
      vaccinated: form.vaccinated.checked,
      lat: latInput.value,
      lon: lonInput.value,
      tg_id: currentTgId(),
      first_name: currentFirstName()
    };

    if (payload.lat === '' || payload.lon === '') {
      showStatus('Сначала укажите местоположение.', 'status-error');
      return;
    }

    showStatus('Сохраняем...', '');
    submitButton.disabled = true;

    fetch('https://pereskazka-ai.ru/dogbuddy/api/dogs.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.text().then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (error) {
            throw new Error('bad json');
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          showStatus((data && data.error) || 'Не удалось сохранить собаку.', 'status-error');
          submitButton.disabled = false;
          return;
        }

        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        showStatus(data.message || 'Собака добавлена', 'status-ok');
        window.setTimeout(function () {
          window.location.href = 'index.html?name=' + encodeURIComponent(payload.name);
        }, 700);
      })
      .catch(function () {
        showStatus('Не удалось связаться с сервером. Проверьте, что папка dogbuddy/api загружена на pereskazka-ai.ru.', 'status-error');
        submitButton.disabled = false;
      });
  });

  function showStatus(text, className) {
    if (!status) {
      window.alert(text);
      return;
    }
    status.textContent = text;
    status.className = 'hint mt-2 ' + className;
  }

  function getUserLocation() {
    if (!navigator.geolocation) {
      showManualCoords();
      return;
    }

    locateButton.disabled = true;
    coordsText.textContent = 'Определяем местоположение...';
    coordsText.className = 'hint';

    navigator.geolocation.getCurrentPosition(function (position) {
      setCoords(position.coords.latitude, position.coords.longitude);
      manualCoords.classList.remove('is-visible');
      locateButton.disabled = false;
    }, function () {
      showManualCoords();
      locateButton.disabled = false;
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  }

  function showManualCoords() {
    coordsText.textContent = 'Не удалось определить местоположение. Введите координаты вручную';
    coordsText.className = 'hint status-error';
    manualCoords.classList.add('is-visible');
  }

  function setCoords(lat, lon) {
    latInput.value = String(lat);
    lonInput.value = String(lon);
    saveCoords(lat, lon);
    coordsText.textContent = 'Координаты: ' + Number(lat).toFixed(4) + ', ' + Number(lon).toFixed(4);
    coordsText.className = 'hint status-ok';
  }

  function syncManualCoords() {
    if (!manualCoords || !manualCoords.classList.contains('is-visible')) {
      return;
    }
    if (latManual.value !== '') {
      latInput.value = latManual.value;
    }
    if (lonManual.value !== '') {
      lonInput.value = lonManual.value;
    }
    if (latInput.value !== '' && lonInput.value !== '') {
      saveCoords(latInput.value, lonInput.value);
      coordsText.textContent = 'Координаты: ' + latInput.value + ', ' + lonInput.value;
      coordsText.className = 'hint status-ok';
    }
  }

  function saveCoords(lat, lon) {
    localStorage.setItem('dogbuddy_lat', String(lat));
    localStorage.setItem('dogbuddy_lon', String(lon));
  }

  function loadFeed() {
    feed.textContent = 'Ищем собак рядом...';
    resolveFeedCoords(function (coords) {
      if (!coords) {
        feed.textContent = 'Не удалось определить местоположение. Вернитесь в анкету и укажите координаты.';
        return;
      }

      var url = 'https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=nearby'
        + '&lat=' + encodeURIComponent(coords.lat)
        + '&lon=' + encodeURIComponent(coords.lon)
        + '&radius=3000&tg_id=' + encodeURIComponent(currentTgId());

      fetch(url)
        .then(function (response) {
          return response.text().then(function (text) {
            var data;
            try {
              data = JSON.parse(text);
            } catch (error) {
              throw new Error('bad json');
            }
            return data;
          });
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            feed.textContent = (data && data.error) || 'Не удалось загрузить собак рядом.';
            return;
          }
          if (data.my_dog_id) {
            rememberDogId(data.my_dog_id);
          }
          renderDogs(data.dogs || []);
        })
        .catch(function () {
          feed.textContent = 'Не удалось связаться с сервером.';
        });
    });
  }

  function resolveFeedCoords(callback) {
    var storedLat = localStorage.getItem('dogbuddy_lat');
    var storedLon = localStorage.getItem('dogbuddy_lon');

    if (!navigator.geolocation) {
      callback(storedLat && storedLon ? { lat: storedLat, lon: storedLon } : null);
      return;
    }

    navigator.geolocation.getCurrentPosition(function (position) {
      saveCoords(position.coords.latitude, position.coords.longitude);
      callback({
        lat: position.coords.latitude,
        lon: position.coords.longitude
      });
    }, function () {
      callback(storedLat && storedLon ? { lat: storedLat, lon: storedLon } : null);
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  }

  function renderDogs(dogs) {
    feed.textContent = '';
    if (!dogs.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Пока никого нет рядом. Загляни позже!';
      feed.appendChild(empty);
      return;
    }

    dogs.forEach(function (dog) {
      feed.appendChild(createDogCard(dog));
    });
  }

  function createDogCard(dog) {
    var card = document.createElement('article');
    card.className = 'card dog-card p-4';

    if (Number(dog.vaccinated) === 1) {
      var badge = document.createElement('span');
      badge.className = 'badge-vaccinated';
      badge.textContent = 'Привит';
      card.appendChild(badge);
    }

    if (dog.photo_url) {
      var photo = document.createElement('img');
      photo.className = 'dog-photo';
      photo.alt = dog.name || 'Собака';
      photo.src = dog.photo_url;
      card.appendChild(photo);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = 'dog-placeholder';
      placeholder.textContent = dog.name ? dog.name.charAt(0) : '?';
      card.appendChild(placeholder);
    }

    var name = document.createElement('h2');
    name.className = 'dog-name';
    name.textContent = dog.name || 'Без имени';
    card.appendChild(name);

    var meta = document.createElement('p');
    meta.className = 'hint dog-meta';
    meta.textContent = [dog.breed || 'Порода не указана', formatWeight(dog.weight_kg), formatDistance(dog.distance_m)].join(' · ');
    card.appendChild(meta);

    var score = Math.max(0, Math.min(100, Number(dog.compatibility) || 0));
    var scoreText = document.createElement('p');
    scoreText.className = 'hint dog-meta';
    scoreText.textContent = 'Совместимость: ' + score + '%';
    card.appendChild(scoreText);

    var bar = document.createElement('div');
    bar.className = 'bar';
    var fill = document.createElement('div');
    fill.className = 'bar-fill ' + compatibilityClass(score);
    fill.style.width = score + '%';
    bar.appendChild(fill);
    card.appendChild(bar);

    var likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.className = 'btn-primary like-btn';
    likeButton.setAttribute('data-dog-id', String(dog.id));
    likeButton.textContent = '❤️ Лайк';
    card.appendChild(likeButton);

    var likeNote = document.createElement('p');
    likeNote.className = 'hint dog-meta like-note';
    card.appendChild(likeNote);

    return card;
  }

  function onLikeClick(event) {
    var button = event.target.closest('.like-btn');
    if (!button || button.disabled) {
      return;
    }

    var toDogId = Number(button.getAttribute('data-dog-id'));
    var card = button.closest('.dog-card');
    var note = card ? card.querySelector('.like-note') : null;
    button.disabled = true;

    fetch('https://pereskazka-ai.ru/dogbuddy/api/likes.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tg_id: currentTgId(),
        to_dog_id: toDogId
      })
    })
      .then(function (response) {
        return response.text().then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (error) {
            throw new Error('bad json');
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          button.disabled = false;
          if (note) {
            note.textContent = (data && data.error) || 'Не удалось отправить лайк.';
            note.className = 'hint dog-meta like-note status-error';
          }
          return;
        }

        if (data.match === true) {
          showMatch(data.chat_id);
          button.textContent = 'Это мэтч!';
          if (card) {
            card.classList.add('is-liked');
          }
          if (note) {
            note.textContent = 'Это мэтч!';
            note.className = 'hint dog-meta like-note status-ok';
          }
          return;
        }

        button.textContent = 'Лайк отправлен!';
        if (card) {
          card.classList.add('is-liked');
        }
        if (note) {
          note.textContent = 'Лайк отправлен!';
          note.className = 'hint dog-meta like-note status-ok';
        }
      })
      .catch(function () {
        button.disabled = false;
        if (note) {
          note.textContent = 'Не удалось связаться с сервером.';
          note.className = 'hint dog-meta like-note status-error';
        }
      });
  }

  function showMatch(chatId) {
    var modal = document.getElementById('match-modal');
    var link = document.getElementById('match-chat-link');
    if (!modal || !link) {
      window.alert('Это мэтч! 🎉');
      return;
    }
    link.href = 'chat.html?chat_id=' + encodeURIComponent(chatId);
    modal.classList.add('is-visible');
  }

  function formatWeight(weight) {
    if (weight === null || weight === undefined || weight === '') {
      return 'вес не указан';
    }
    return String(weight) + ' кг';
  }

  function formatDistance(meters) {
    var value = Number(meters);
    if (!isFinite(value)) {
      return 'расстояние неизвестно';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + ' км';
    }
    return Math.round(value) + ' м';
  }

  function compatibilityClass(score) {
    if (score > 80) {
      return 'bar-high';
    }
    if (score >= 50) {
      return 'bar-mid';
    }
    return 'bar-low';
  }

  function initChat(chatBox) {
    var params = new URLSearchParams(window.location.search);
    var chatId = Number(params.get('chat_id'));
    var chatForm = document.getElementById('chat-form');
    var input = document.getElementById('chat-text');
    var previousCount = -1;
    var loading = false;
    var requestId = 0;

    if (!chatId || chatId < 1) {
      showChatStatus('Не указан чат.', true);
      if (chatForm) {
        chatForm.querySelector('button').disabled = true;
      }
      return;
    }

    if (chatForm && input) {
      chatForm.addEventListener('submit', function (event) {
        event.preventDefault();
        sendChatMessage();
      });
    }

    var walkLink = document.getElementById('chat-walk-link');
    if (walkLink) {
      walkLink.href = 'walk.html?chat_id=' + encodeURIComponent(chatId);
    }

    var walkBox = document.getElementById('chat-walks');
    if (walkBox) {
      walkBox.addEventListener('click', onWalkAction);
      loadWalks();
    }

    loadChatMessages(true);
    setInterval(function () {
      loadChatMessages(false);
    }, 5000);

    function loadWalks() {
      fetch('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=list&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId()))
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!walkBox) {
            return;
          }
          if (!data || data.ok !== true) {
            walkBox.hidden = false;
            walkBox.textContent = '';
            var note = document.createElement('p');
            note.className = 'hint';
            note.textContent = (data && data.error) || 'Не удалось загрузить прогулки.';
            walkBox.appendChild(note);
            return;
          }
          renderWalks(walkBox, data.walks || [], {
            chatId: chatId,
            partnerDogId: Number(data.partner_dog_id) || 0,
            partnerName: data.partner_name || ''
          });
        })
        .catch(function () {
          if (!walkBox) {
            return;
          }
          walkBox.hidden = false;
          walkBox.textContent = '';
          var note = document.createElement('p');
          note.className = 'hint status-error';
          note.textContent = 'Не удалось загрузить прогулки.';
          walkBox.appendChild(note);
        });
    }

    function onWalkAction(event) {
      var button = event.target.closest('[data-walk-action]');
      if (!button || button.disabled) {
        return;
      }
      var walkId = Number(button.getAttribute('data-walk-id'));
      var status = button.getAttribute('data-walk-action');
      button.disabled = true;

      fetch('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          walk_id: walkId,
          status: status
        })
      })
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            showChatStatus((data && data.error) || 'Не удалось обновить прогулку.', true);
            button.disabled = false;
            return;
          }
          showChatStatus('', false);
          loadWalks();
        })
        .catch(function () {
          showChatStatus('Не удалось связаться с сервером.', true);
          button.disabled = false;
        });
    }

    function loadChatMessages(force) {
      if (loading && !force) {
        return;
      }
      loading = true;
      var current = ++requestId;

      fetch('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=get_messages&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId()))
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (current !== requestId) {
            return;
          }
          if (!data || data.ok !== true) {
            showChatStatus((data && data.error) || 'Не удалось загрузить сообщения.', true);
            return;
          }
          showChatStatus('', false);
          if (data.my_dog_id) {
            rememberDogId(data.my_dog_id);
          }
          if (data.partner_name) {
            showPartner(data.partner_name);
          }
          renderChatMessages(data.messages || []);
        })
        .catch(function () {
          if (current !== requestId) {
            return;
          }
          showChatStatus('Не удалось связаться с сервером.', true);
        })
        .then(function () {
          if (current === requestId) {
            loading = false;
          }
        });
    }

    function sendChatMessage() {
      var text = input.value.trim();
      var button = chatForm.querySelector('button');
      if (!text) {
        return;
      }

      button.disabled = true;
      fetch('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          chat_id: chatId,
          text: text
        })
      })
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            showChatStatus((data && data.error) || 'Не удалось отправить сообщение.', true);
            return;
          }
          input.value = '';
          showChatStatus('', false);
          loadChatMessages(true);
        })
        .catch(function () {
          showChatStatus('Не удалось связаться с сервером.', true);
        })
        .then(function () {
          button.disabled = false;
        });
    }

    function renderChatMessages(messages) {
      var shouldScroll = previousCount < 0 || messages.length > previousCount;
      previousCount = messages.length;
      chatBox.textContent = '';

      if (!messages.length) {
        var empty = document.createElement('p');
        empty.className = 'hint chat-empty';
        empty.textContent = 'Пока нет сообщений. Напишите первым.';
        chatBox.appendChild(empty);
        return;
      }

      messages.forEach(function (message) {
        chatBox.appendChild(createChatBubble(message));
      });

      if (shouldScroll) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }
  }

  function createChatBubble(message) {
    var outgoing = Number(message.sender_dog_id) === currentDogId();
    var bubble = document.createElement('div');
    bubble.className = outgoing ? 'chat-bubble chat-bubble-out' : 'chat-bubble chat-bubble-in';

    var text = document.createElement('p');
    text.className = 'chat-text';
    text.textContent = message.text || '';

    var time = document.createElement('time');
    time.className = 'chat-time';
    time.textContent = formatChatTime(message.created_at);

    bubble.appendChild(text);
    bubble.appendChild(time);
    return bubble;
  }

  function showPartner(name) {
    var title = name || 'Собеседник';
    var partner = document.getElementById('chat-partner');
    var avatar = document.getElementById('chat-avatar');
    if (partner) {
      partner.textContent = title;
    }
    if (avatar) {
      avatar.textContent = title.charAt(0) || '?';
    }
  }

  function showChatStatus(message, isError) {
    var status = document.getElementById('chat-status');
    if (!status) {
      return;
    }
    status.textContent = message || '';
    status.className = isError ? 'hint chat-status status-error' : 'hint chat-status';
  }

  function formatChatTime(value) {
    var match = String(value || '').match(/(\d{2}):(\d{2})/);
    return match ? match[1] + ':' + match[2] : '';
  }

  function renderWalks(box, walks, info) {
    var active = walks.filter(function (walk) {
      return walk.status === 'proposed' || walk.status === 'confirmed' || walk.status === 'done';
    });
    box.textContent = '';
    if (!active.length) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    var title = document.createElement('p');
    title.className = 'walk-list-title';
    title.textContent = 'Прогулки';
    box.appendChild(title);

    active.forEach(function (walk) {
      box.appendChild(createWalkCard(walk, info || {}));
    });
  }

  function createWalkCard(walk, info) {
    var card = document.createElement('article');
    card.className = 'walk-card';

    var place = document.createElement('p');
    place.className = 'walk-place';
    place.textContent = walk.place || 'Место не указано';
    card.appendChild(place);

    var meta = document.createElement('p');
    meta.className = 'hint walk-meta';
    meta.textContent = formatWalkTime(walk.scheduled_at);
    card.appendChild(meta);

    var status = document.createElement('p');
    status.className = 'walk-meta walk-status-' + (walk.status || '');
    status.textContent = walkStatusLabel(walk.status);
    card.appendChild(status);

    if (walk.status === 'proposed' || walk.status === 'confirmed') {
      var actions = document.createElement('div');
      actions.className = 'walk-actions';
      if (walk.status === 'proposed') {
        actions.appendChild(createWalkButton(walk.id, 'confirmed', 'Подтвердить', 'btn-primary'));
      }
      actions.appendChild(createWalkButton(walk.id, 'cancelled', 'Отменить', 'btn-secondary'));
      card.appendChild(actions);
    }

    if ((walk.status === 'confirmed' || walk.status === 'done') && info.partnerDogId) {
      card.appendChild(createReviewLink(walk.id, info));
    }

    return card;
  }

  function createReviewLink(walkId, info) {
    var link = document.createElement('a');
    link.className = 'btn-primary walk-review-link';
    link.textContent = 'Оставить отзыв';
    var params = new URLSearchParams();
    params.set('walk_id', String(walkId));
    params.set('about_dog_id', String(info.partnerDogId));
    params.set('chat_id', String(info.chatId || ''));
    if (info.partnerName) {
      params.set('name', info.partnerName);
    }
    link.href = 'review.html?' + params.toString();
    return link;
  }

  function createWalkButton(walkId, action, label, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('data-walk-id', String(walkId));
    button.setAttribute('data-walk-action', action);
    button.textContent = label;
    return button;
  }

  function walkStatusLabel(status) {
    if (status === 'proposed') {
      return 'Статус: предложена';
    }
    if (status === 'confirmed') {
      return 'Статус: подтверждена';
    }
    if (status === 'cancelled') {
      return 'Статус: отменена';
    }
    if (status === 'done') {
      return 'Статус: завершена';
    }
    return 'Статус: ' + (status || 'неизвестен');
  }

  function formatWalkTime(value) {
    var match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) {
      return '';
    }
    return match[3] + '.' + match[2] + '.' + match[1] + ', ' + match[4] + ':' + match[5];
  }

  function initWalk(walkForm) {
    var params = new URLSearchParams(window.location.search);
    var chatId = Number(params.get('chat_id'));
    var back = document.getElementById('walk-back');
    var partner = document.getElementById('walk-partner');
    var submitButton = walkForm.querySelector('button[type="submit"]');
    var matchId = 0;

    if (back && chatId > 0) {
      back.href = 'chat.html?chat_id=' + encodeURIComponent(chatId);
    }
    if (!chatId || chatId < 1) {
      showWalkStatus('Не указан чат.', true);
      submitButton.disabled = true;
      return;
    }

    fetch('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=list&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId()))
      .then(function (response) {
        return readJson(response);
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          showWalkStatus((data && data.error) || 'Не удалось открыть чат.', true);
          submitButton.disabled = true;
          return;
        }
        matchId = Number(data.match_id) || 0;
        if (partner) {
          partner.textContent = 'С кем: ' + (data.partner_name || 'собеседник');
        }
      })
      .catch(function () {
        showWalkStatus('Не удалось связаться с сервером.', true);
        submitButton.disabled = true;
      });

    walkForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var place = walkForm.place.value.trim();
      var scheduledAt = walkForm.scheduled_at.value;
      if (!matchId) {
        showWalkStatus('Чат ещё не загрузился.', true);
        return;
      }
      if (!place || !scheduledAt) {
        showWalkStatus('Укажите место и время.', true);
        return;
      }

      submitButton.disabled = true;
      showWalkStatus('Сохраняем...', false);
      fetch('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          tg_id: currentTgId(),
          place: place,
          lat: storedCoordinate('dogbuddy_lat'),
          lon: storedCoordinate('dogbuddy_lon'),
          scheduled_at: scheduledAt
        })
      })
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            showWalkStatus((data && data.error) || 'Не удалось предложить прогулку.', true);
            submitButton.disabled = false;
            return;
          }
          window.alert('Прогулка предложена!');
          window.location.href = 'chat.html?chat_id=' + encodeURIComponent(chatId);
        })
        .catch(function () {
          showWalkStatus('Не удалось связаться с сервером.', true);
          submitButton.disabled = false;
        });
    });
  }

  function initReview(reviewForm) {
    var params = new URLSearchParams(window.location.search);
    var walkId = Number(params.get('walk_id'));
    var aboutDogId = Number(params.get('about_dog_id'));
    var chatId = Number(params.get('chat_id'));
    var dogName = params.get('name') || '';
    var title = document.getElementById('review-title');
    var back = document.getElementById('review-back');
    var ratingInput = document.getElementById('review-rating');
    var starRow = document.getElementById('star-row');
    var submitButton = reviewForm.querySelector('button[type="submit"]');
    var backHref = chatId > 0 ? 'chat.html?chat_id=' + encodeURIComponent(chatId) : 'profile.html';

    if (title && dogName) {
      title.textContent = 'Оцените прогулку с ' + dogName;
    }
    if (back) {
      back.href = backHref;
    }
    if (!walkId || walkId < 1 || !aboutDogId || aboutDogId < 1) {
      showReviewStatus('Не указана прогулка.', true);
      submitButton.disabled = true;
      return;
    }

    if (starRow) {
      starRow.addEventListener('click', function (event) {
        var node = event.target.nodeType === 1 ? event.target : event.target.parentElement;
        var star = node ? node.closest('[data-rating]') : null;
        if (!star) {
          return;
        }
        var rating = Number(star.getAttribute('data-rating'));
        ratingInput.value = String(rating);
        var stars = starRow.querySelectorAll('.star');
        Array.prototype.forEach.call(stars, function (item) {
          var value = Number(item.getAttribute('data-rating'));
          item.classList.toggle('is-selected', value <= rating);
        });
      });
    }

    reviewForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var rating = Number(ratingInput.value);
      var text = reviewForm.text.value.trim();
      if (!rating || rating < 1 || rating > 5) {
        showReviewStatus('Поставьте оценку от 1 до 5.', true);
        return;
      }

      submitButton.disabled = true;
      showReviewStatus('Сохраняем...', false);
      fetch('https://pereskazka-ai.ru/dogbuddy/api/reviews.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          walk_id: walkId,
          about_dog_id: aboutDogId,
          rating: rating,
          text: text
        })
      })
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            showReviewStatus((data && data.error) || 'Не удалось отправить отзыв.', true);
            submitButton.disabled = false;
            return;
          }
          showReviewStatus('Спасибо за отзыв!', false);
          window.alert('Спасибо за отзыв!');
          window.location.href = backHref;
        })
        .catch(function () {
          showReviewStatus('Не удалось связаться с сервером.', true);
          submitButton.disabled = false;
        });
    });
  }

  function showReviewStatus(message, isError) {
    var status = document.getElementById('review-status');
    if (!status) {
      return;
    }
    status.textContent = message || '';
    status.className = isError ? 'hint review-status status-error' : 'hint review-status status-ok';
  }

  function showWalkStatus(message, isError) {
    var status = document.getElementById('walk-status');
    if (!status) {
      return;
    }
    status.textContent = message || '';
    status.className = isError ? 'hint walk-status status-error' : 'hint walk-status';
  }

  function storedCoordinate(key) {
    var value = window.localStorage ? window.localStorage.getItem(key) : '';
    var number = Number(value);
    return value && isFinite(number) ? number : null;
  }

  function rememberAccount() {
    var user = telegramUser();
    if (user && user.id) {
      writeStorage('dogbuddy_tg_id', String(user.id));
      if (user.first_name) {
        writeStorage('dogbuddy_first_name', String(user.first_name));
      }
      return {
        tgId: Number(user.id),
        firstName: user.first_name || '',
        inTelegram: true
      };
    }

    var insideTelegram = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
    if (insideTelegram) {
      var savedId = Number(readStorage('dogbuddy_tg_id'));
      if (savedId > 0) {
        return {
          tgId: savedId,
          firstName: readStorage('dogbuddy_first_name') || '',
          inTelegram: true
        };
      }
    }

    return {
      tgId: 1,
      firstName: '',
      inTelegram: false
    };
  }

  function telegramUser() {
    var tgApp = window.Telegram && window.Telegram.WebApp;
    var user = tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user;
    return user && user.id ? user : null;
  }

  function currentTgId() {
    var user = telegramUser();
    if (user && user.id) {
      writeStorage('dogbuddy_tg_id', String(user.id));
      if (user.first_name) {
        writeStorage('dogbuddy_first_name', String(user.first_name));
      }
      return Number(user.id);
    }
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      var savedId = Number(readStorage('dogbuddy_tg_id'));
      if (savedId > 0) {
        return savedId;
      }
    }
    return 1;
  }

  function currentFirstName() {
    var user = telegramUser();
    if (user && user.first_name) {
      return String(user.first_name);
    }
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      return readStorage('dogbuddy_first_name') || '';
    }
    return '';
  }

  function currentDogId() {
    var saved = Number(readStorage('dogbuddy_dog_id'));
    return saved > 0 ? saved : 1;
  }

  function rememberDogId(dogId) {
    var id = Number(dogId);
    if (id > 0) {
      writeStorage('dogbuddy_dog_id', String(id));
    }
  }

  function readStorage(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) || '' : '';
    } catch (error) {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {}
  }

  function fetchMyDog() {
    return fetch('https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=me&tg_id=' + encodeURIComponent(currentTgId()))
      .then(readJson)
      .catch(function () {
        return null;
      });
  }

  function loadHome() {
    var menu = document.getElementById('home-menu');
    var registerBlock = document.getElementById('home-register');
    var homeStatus = document.getElementById('home-status');
    var retry = document.getElementById('home-retry');
    if (!menu || !registerBlock) {
      return;
    }

    menu.classList.add('is-hidden');
    registerBlock.classList.add('is-hidden');
    if (retry) {
      retry.classList.add('is-hidden');
    }
    if (homeStatus) {
      homeStatus.textContent = 'Проверяем анкету...';
      homeStatus.className = 'hint mb-4';
    }

    fetchMyDog().then(function (data) {
      if (!data || data.ok !== true) {
        if (homeStatus) {
          homeStatus.textContent = 'Не удалось проверить анкету.';
          homeStatus.className = 'hint mb-4 status-error';
        }
        if (retry) {
          retry.classList.remove('is-hidden');
        }
        return;
      }

      if (data.has_dog) {
        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        var dogLine = document.getElementById('home-dog');
        if (dogLine) {
          dogLine.textContent = data.name ? ('Ваша собака: ' + data.name) : 'Анкета сохранена';
        }
        var savedName = new URLSearchParams(window.location.search).get('name');
        if (homeStatus) {
          if (savedName) {
            homeStatus.textContent = 'Собака «' + savedName + '» добавлена.';
            homeStatus.className = 'hint mb-4 status-ok';
          } else {
            homeStatus.textContent = '';
          }
        }
        menu.classList.remove('is-hidden');
        return;
      }

      if (homeStatus) {
        homeStatus.textContent = '';
      }
      registerBlock.classList.remove('is-hidden');
    });
  }

  function showGateError() {
    var main = document.querySelector('main');
    if (!main) {
      return;
    }
    var note = document.createElement('p');
    note.className = 'hint status-error';
    note.textContent = 'Не удалось проверить анкету. Откройте приложение ещё раз.';
    main.insertBefore(note, main.firstChild);
  }

  function readJson(response) {
    return response.text().then(function (raw) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        throw new Error('bad json');
      }
    });
  }
});
