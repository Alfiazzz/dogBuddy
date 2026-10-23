document.addEventListener('DOMContentLoaded', function () {
  var account = rememberAccount();
  var greeting = document.getElementById('tg-user');
  var profileUser = document.getElementById('profile-user');
  var status = document.getElementById('form-status');
  var form = document.getElementById('dog-form');
  var feed = document.getElementById('feed-container');
  var tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  checkNetworkStatus();
  window.addEventListener('online', function () {
    checkNetworkStatus();
    showSuccessMessage('Соединение восстановлено');
    replayPending();
  });
  window.addEventListener('offline', function () {
    checkNetworkStatus();
    showValidationError('Нет интернета. Проверьте подключение');
  });

  if (document.body.getAttribute('data-requires-dog') === '1') {
    document.body.classList.add('is-checking');
    if (document.getElementById('profile-container')) {
      showLoader('profile-container');
    }
    fetchMyDog().then(function (data) {
      hideLoader('profile-container');
      if (data && data.ok === true && data.has_dog) {
        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        showProfilePhoto(data);
        fillProfile(data);
        document.body.classList.remove('is-checking');
        return;
      }
      if (data && data.ok === true) {
        window.location.replace('index.html');
        return;
      }
      document.body.classList.remove('is-checking');
      if (document.getElementById('profile-container')) {
        showLoadError('profile-container', loadProfile);
        return;
      }
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

  var photoFileInput = document.getElementById('photo-file');
  var photoPreview = document.getElementById('photo-preview');
  var photoUrlInput = document.getElementById('photo-url');
  var photoBusy = false;

  if (photoFileInput) {
    photoFileInput.addEventListener('change', onPhotoChosen);
  }

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

  var chatBox = document.getElementById('messages-container');
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

  var chatList = document.getElementById('chats-list');
  if (chatList) {
    loadMyChats(chatList);
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        loadMyChats(chatList);
      }
    });
  }

  var walkList = document.getElementById('walks-list');
  if (walkList) {
    loadMyWalks(walkList);
  }

  var profileForm = document.getElementById('profile-form');
  var profileEditButton = document.getElementById('profile-edit');
  var profileCancelButton = document.getElementById('profile-cancel');
  if (profileEditButton) {
    profileEditButton.addEventListener('click', function () {
      toggleEditMode(true);
    });
  }
  if (profileCancelButton) {
    profileCancelButton.addEventListener('click', function () {
      resetProfilePhotoDraft();
      toggleEditMode(false);
    });
  }
  if (profileForm) {
    profileForm.addEventListener('submit', updateProfile);
  }

  var deleteAccountButton = document.getElementById('delete-account');
  var deleteModal = document.getElementById('delete-modal');
  var deleteCancelButton = document.getElementById('delete-cancel');
  var deleteConfirmButton = document.getElementById('delete-confirm');
  if (deleteAccountButton) {
    deleteAccountButton.addEventListener('click', deleteAccount);
  }
  if (deleteCancelButton) {
    deleteCancelButton.addEventListener('click', closeDeleteModal);
  }
  if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener('click', confirmDeleteAccount);
  }
  if (deleteModal) {
    deleteModal.addEventListener('click', function (event) {
      if (event.target === deleteModal) {
        closeDeleteModal();
      }
    });
  }

  if (!form) {
    return;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var submitButton = form.querySelector('button[type="submit"]');
    syncManualCoords();
    var name = form.name.value.trim();
    var breed = form.breed.value.trim();
    var inputError = dogNameError(name) || breedError(breed) || weightError(form.weight_kg.value) || activityError(form.activity.value) || coordError(latInput.value, lonInput.value);
    if (photoBusy) {
      showStatus('Подождите, фото ещё готовится.', 'status-error');
      showValidationError('Подождите, фото ещё готовится.');
      return;
    }
    if (inputError) {
      showStatus(inputError, 'status-error');
      showValidationError(inputError);
      return;
    }

    var payload = {
      name: name,
      breed: breed,
      weight_kg: Number(form.weight_kg.value),
      activity: Number(form.activity.value),
      vaccinated: form.vaccinated.checked ? 1 : 0,
      home_lat: Number(latInput.value),
      home_lon: Number(lonInput.value),
      radius_m: 3000,
      photo_url: safePhotoUrl(photoUrlInput ? photoUrlInput.value : ''),
      tg_id: currentTgId(),
      init_data: currentInitData(),
      first_name: currentFirstName()
    };

    showStatus('Сохраняем...', '');
    submitButton.disabled = true;
    showLoadingOverlay('dog-form');

    fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/dogs.php', {
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
          showValidationError((data && data.error) || 'Не удалось сохранить собаку.');
          enableIfOnline(submitButton);
          hideLoadingOverlay('dog-form');
          return;
        }

        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        showStatus(data.message || 'Собака добавлена', 'status-ok');
        showSuccessMessage('Собака добавлена.');
        hideLoadingOverlay('dog-form');
        window.setTimeout(function () {
          window.location.href = 'index.html?name=' + encodeURIComponent(payload.name);
        }, 700);
      })
      .catch(function (error) {
        if (!alreadyTold(error)) {
          showStatus('Не удалось связаться с сервером. Проверьте, что папка dogbuddy/api загружена на pereskazka-ai.ru.', 'status-error');
          showValidationError('Не удалось связаться с сервером.');
        } else {
          showStatus(error.message, 'status-error');
        }
        enableIfOnline(submitButton);
        hideLoadingOverlay('dog-form');
      });
  });

  function onPhotoChosen() {
    var file = photoFileInput.files && photoFileInput.files[0];
    if (!file) {
      photoBusy = false;
      photoUrlInput.value = '';
      photoPreview.classList.add('is-hidden');
      photoPreview.removeAttribute('src');
      return;
    }
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showStatus('Выберите файл изображения.', 'status-error');
      photoFileInput.value = '';
      return;
    }

    var body = new FormData();
    body.append('file', file);
    body.append('upload_preset', 'dogbuddy-photos');
    photoBusy = true;
    photoUrlInput.value = '';
    showStatus('Загружаем фото...', '');

    fetchWithNetworkCheck('https://api.cloudinary.com/v1_1/lw4r1ilo/image/upload', {
      method: 'POST',
      body: body
    })
      .then(function (response) {
        return response.text().then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (error) {
            throw new Error('bad json');
          }
          if (!response.ok || !data || !data.secure_url) {
            throw new Error('upload failed');
          }
          return data;
        });
      })
      .then(function (data) {
        photoUrlInput.value = data.secure_url;
        photoPreview.src = safePhotoUrl(data.secure_url);
        photoPreview.classList.remove('is-hidden');
        var profilePhoto = document.getElementById('profile-photo');
        if (profilePhoto) {
          profilePhoto.src = safePhotoUrl(data.secure_url);
          profilePhoto.alt = 'Новое фото собаки';
        }
        photoBusy = false;
        showStatus('Фото загружено', 'status-ok');
      })
      .catch(function (error) {
        photoBusy = false;
        photoUrlInput.value = '';
        photoPreview.classList.add('is-hidden');
        photoPreview.removeAttribute('src');
        if (error && (error.type === 'network_offline' || error.type === 'timeout')) {
          showStatus(error.message, 'status-error');
          return;
        }
        showStatus('Не удалось загрузить фото, попробуйте ещё раз', 'status-error');
      });
  }

  var currentDogProfile = null;

  function activityLabel(value) {
    var labels = {
      1: '1 — очень спокойный',
      2: '2 — спокойный',
      3: '3 — средний',
      4: '4 — активный',
      5: '5 — очень активный'
    };
    return labels[Number(value)] || 'не указана';
  }

  function fillProfile(data) {
    if (!data || data.has_dog === false) {
      return;
    }
    currentDogProfile = data;
    showProfilePhoto(data);
    var nameNode = document.getElementById('profile-name');
    var breedNode = document.getElementById('profile-breed');
    var weightNode = document.getElementById('profile-weight');
    var activityNode = document.getElementById('profile-activity');
    var vaccinatedNode = document.getElementById('profile-vaccinated');
    var locationNode = document.getElementById('profile-location');
    if (nameNode) {
      nameNode.textContent = 'Имя: ' + (data.name || '—');
    }
    if (breedNode) {
      breedNode.textContent = 'Порода: ' + (data.breed || '—');
    }
    if (weightNode) {
      weightNode.textContent = 'Вес: ' + (data.weight_kg === null || data.weight_kg === undefined || data.weight_kg === '' ? '—' : (Number(data.weight_kg) + ' кг'));
    }
    if (activityNode) {
      activityNode.textContent = 'Активность: ' + activityLabel(data.activity);
    }
    if (vaccinatedNode) {
      vaccinatedNode.textContent = 'Прививки: ' + (Number(data.vaccinated) === 1 ? 'да' : 'нет');
    }
    if (locationNode) {
      var lat = data.home_lat;
      var lon = data.home_lon;
      locationNode.textContent = (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '')
        ? 'Место: не указано'
        : ('Место: ' + Number(lat).toFixed(5) + ', ' + Number(lon).toFixed(5));
    }
    var profileError = document.querySelector('#profile-container .load-error');
    if (profileError) {
      profileError.remove();
    }
  }

  function fillProfileFields(data) {
    var profileForm = document.getElementById('profile-form');
    if (!profileForm || !data) {
      return;
    }
    profileForm.name.value = data.name || '';
    profileForm.breed.value = data.breed || '';
    profileForm.weight_kg.value = data.weight_kg === null || data.weight_kg === undefined ? '' : String(Number(data.weight_kg));
    profileForm.activity.value = data.activity ? String(data.activity) : '';
    profileForm.vaccinated.checked = Number(data.vaccinated) === 1;
    if (latInput) {
      latInput.value = data.home_lat === null || data.home_lat === undefined ? '' : String(data.home_lat);
    }
    if (lonInput) {
      lonInput.value = data.home_lon === null || data.home_lon === undefined ? '' : String(data.home_lon);
    }
    if (latManual) {
      latManual.value = latInput ? latInput.value : '';
    }
    if (lonManual) {
      lonManual.value = lonInput ? lonInput.value : '';
    }
    if (manualCoords && latInput && latInput.value !== '' && lonInput && lonInput.value !== '') {
      manualCoords.classList.add('is-visible');
    }
    if (coordsText && latInput && latInput.value !== '' && lonInput && lonInput.value !== '') {
      coordsText.textContent = 'Координаты: ' + latInput.value + ', ' + lonInput.value;
      coordsText.className = 'hint status-ok';
    }
  }

  function toggleEditMode(editing) {
    var view = document.getElementById('profile-view');
    var edit = document.getElementById('profile-form');
    if (!view || !edit) {
      return;
    }
    if (editing && !currentDogProfile) {
      return;
    }
    if (editing) {
      fillProfileFields(currentDogProfile);
      view.classList.add('is-hidden');
      edit.classList.remove('is-hidden');
      return;
    }
    edit.classList.add('is-hidden');
    view.classList.remove('is-hidden');
  }

  function resetProfilePhotoDraft() {
    if (photoFileInput) {
      photoFileInput.value = '';
    }
    if (photoUrlInput) {
      photoUrlInput.value = '';
    }
    if (photoPreview) {
      photoPreview.classList.add('is-hidden');
      photoPreview.removeAttribute('src');
    }
    photoBusy = false;
    showProfilePhoto(currentDogProfile);
    showStatus('', '');
  }

  function updateProfile(event) {
    event.preventDefault();
    var profileForm = document.getElementById('profile-form');
    if (!profileForm) {
      return;
    }
    syncManualCoords();
    var name = profileForm.name.value.trim();
    var breed = profileForm.breed.value.trim();
    var inputError = dogNameError(name) || breedError(breed) || weightError(profileForm.weight_kg.value) || activityError(profileForm.activity.value) || coordError(latInput.value, lonInput.value);
    var submitButton = document.getElementById('profile-save');
    if (photoBusy) {
      showStatus('Подождите, фото ещё готовится.', 'status-error');
      showValidationError('Подождите, фото ещё готовится.');
      return;
    }
    if (photoFileInput && photoFileInput.files && photoFileInput.files.length && !(photoUrlInput && photoUrlInput.value.trim())) {
      showStatus('Не удалось загрузить фото, попробуйте ещё раз', 'status-error');
      showValidationError('Не удалось загрузить фото, попробуйте ещё раз');
      return;
    }
    if (inputError) {
      showStatus(inputError, 'status-error');
      showValidationError(inputError);
      return;
    }

    var body = new FormData();
    body.append('name', name);
    body.append('breed', breed);
    body.append('weight_kg', String(Number(profileForm.weight_kg.value)));
    body.append('activity', String(Number(profileForm.activity.value)));
    body.append('vaccinated', profileForm.vaccinated.checked ? '1' : '0');
    body.append('home_lat', String(Number(latInput.value)));
    body.append('home_lon', String(Number(lonInput.value)));
    body.append('radius_m', String(currentDogProfile && currentDogProfile.radius_m ? currentDogProfile.radius_m : 3000));
    body.append('tg_id', String(currentTgId()));
    body.append('init_data', currentInitData());
    var nextPhoto = photoUrlInput ? photoUrlInput.value.trim() : '';
    if (nextPhoto) {
      body.append('photo_url', nextPhoto);
    }

    showStatus('Сохраняем...', '');
    if (submitButton) {
      submitButton.disabled = true;
    }
    showLoadingOverlay('profile-container');

    fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=update_profile', {
      method: 'POST',
      body: body
    })
      .then(readJson)
      .then(function (data) {
        if (!data || data.ok !== true) {
          showStatus((data && data.error) || 'Не удалось обновить профиль.', 'status-error');
          showValidationError((data && data.error) || 'Не удалось обновить профиль.');
          enableIfOnline(submitButton);
          hideLoadingOverlay('profile-container');
          return;
        }
        fillProfile(data);
        resetProfilePhotoDraft();
        toggleEditMode(false);
        showStatus('', '');
        showSuccessMessage('Профиль обновлен');
        enableIfOnline(submitButton);
        hideLoadingOverlay('profile-container');
      })
      .catch(function (error) {
        if (!alreadyTold(error)) {
          showValidationError('Не удалось связаться с сервером.');
        }
        enableIfOnline(submitButton);
        hideLoadingOverlay('profile-container');
      });
  }

  function deleteAccount() {
    var modal = document.getElementById('delete-modal');
    if (!modal) {
      return;
    }
    modal.classList.remove('is-hidden');
  }

  function closeDeleteModal() {
    var modal = document.getElementById('delete-modal');
    if (modal) {
      modal.classList.add('is-hidden');
    }
  }

  function confirmDeleteAccount() {
    var button = document.getElementById('delete-confirm');
    if (button) {
      button.disabled = true;
    }
    fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=delete_account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tg_id: currentTgId(),
        init_data: currentInitData()
      })
    })
      .then(readJson)
      .then(function (data) {
        if (!data || data.ok !== true) {
          showValidationError((data && data.error) || 'Не удалось удалить аккаунт.');
          enableIfOnline(button);
          return;
        }
        try {
          window.localStorage.removeItem('dogbuddy_dog_id');
        } catch (error) {
          // Хранилище браузера может быть недоступно.
        }
        closeDeleteModal();
        showSuccessMessage('Аккаунт удален');
        window.setTimeout(function () {
          window.location.href = 'index.html';
        }, 700);
      })
      .catch(function (error) {
        if (!alreadyTold(error)) {
          showValidationError('Не удалось удалить аккаунт.');
        }
        enableIfOnline(button);
      });
  }

  function showProfilePhoto(data) {
    var profilePhoto = document.getElementById('profile-photo');
    if (!profilePhoto) {
      return;
    }
    profilePhoto.src = safePhotoUrl(data && data.photo_url);
    profilePhoto.alt = (data && data.name) ? data.name : 'Фото собаки';
  }

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
    showLoader('feed-container');
    if (navigator.onLine === false) {
      showValidationError('Нет интернета. Проверьте подключение');
      showLoadError('feed-container', loadFeed);
      return;
    }
    resolveFeedCoords(function (coords) {
      if (!coords) {
        feed.textContent = 'Не удалось определить местоположение. Вернитесь в анкету и укажите координаты.';
        return;
      }

      var url = 'https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=nearby'
        + '&lat=' + encodeURIComponent(coords.lat)
        + '&lon=' + encodeURIComponent(coords.lon)
        + '&radius=3000&tg_id=' + encodeURIComponent(currentTgId());

      fetchWithNetworkCheck(withInitData(url))
        .then(readJson)
        .then(function (data) {
          if (!data || data.ok !== true) {
            showLoadError('feed-container', loadFeed, data && data.error);
            return;
          }
          if (data.my_dog_id) {
            rememberDogId(data.my_dog_id);
          }
          renderDogs(data.dogs || []);
        })
        .catch(function () {
          showLoadError('feed-container', loadFeed);
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

    var photo = document.createElement('img');
    photo.className = 'dog-photo';
    photo.alt = dog.name || 'Собака';
    photo.src = safePhotoUrl(dog.photo_url);
    photo.addEventListener('error', function () {
      if (photo.getAttribute('data-fallback') === '1') {
        return;
      }
      photo.setAttribute('data-fallback', '1');
      photo.src = 'https://via.placeholder.com/300x300?text=No+Photo';
    });
    card.appendChild(photo);

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

    var toDogId = positiveId(button.getAttribute('data-dog-id'));
    var card = button.closest('.dog-card');
    var note = card ? card.querySelector('.like-note') : null;
    if (!toDogId) {
      showValidationError('Не удалось определить собаку.');
      return;
    }
    button.disabled = true;

    fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/likes.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          init_data: currentInitData(),
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
        var chatButton = chatForm.querySelector('button');
        chatButton.disabled = true;
        chatButton.removeAttribute('data-network-lock');
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
    window.addEventListener('dogbuddy-online', function () {
      if (chatBox.querySelector('.load-error')) {
        previousCount = -1;
        loadChatMessages(true);
      }
    });

    function loadWalks() {
      fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=list&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId())))
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
      var walkId = positiveId(button.getAttribute('data-walk-id'));
      var status = button.getAttribute('data-walk-action');
      if (!walkId || (status !== 'confirmed' && status !== 'cancelled')) {
        showChatStatus('Не удалось обновить прогулку.', true);
        showValidationError('Не удалось обновить прогулку.');
        return;
      }
      button.disabled = true;

      fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          init_data: currentInitData(),
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
            showValidationError((data && data.error) || 'Не удалось обновить прогулку.');
            enableIfOnline(button);
            return;
          }
          showChatStatus('', false);
          showSuccessMessage(status === 'confirmed' ? 'Прогулка подтверждена.' : 'Прогулка отменена.');
          loadWalks();
        })
        .catch(function (error) {
          if (!alreadyTold(error)) {
            showChatStatus('Не удалось связаться с сервером.', true);
            showValidationError('Не удалось связаться с сервером.');
          } else {
            showChatStatus(error.message, true);
          }
          enableIfOnline(button);
        });
    }

    function loadChatMessages(force) {
      if (loading && !force) {
        return;
      }
      loading = true;
      var current = ++requestId;
      var firstPaint = previousCount < 0;
      if (firstPaint) {
        showLoader('messages-container');
      }

      fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=get_messages&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId())))
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (current !== requestId) {
            return;
          }
          if (!data || data.ok !== true) {
            if (firstPaint) {
              showLoadError('messages-container', function () {
                previousCount = -1;
                loadChatMessages(true);
              }, data && data.error);
            }
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
          var incoming = (data.messages || []).length;
          var hasNew = previousCount >= 0 && incoming > previousCount;
          renderChatMessages(data.messages || []);
          if (firstPaint || hasNew) {
            markChatAsRead(chatId);
          }
        })
        .catch(function (error) {
          if (current !== requestId) {
            return;
          }
          if (firstPaint) {
            showLoadError('messages-container', function () {
              previousCount = -1;
              loadChatMessages(true);
            });
          }
          if (!alreadyTold(error)) {
            showChatStatus('Не удалось связаться с сервером.', true);
          } else {
            showChatStatus(error.message, true);
          }
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
      var inputError = chatTextError(text);
      if (!positiveId(chatId)) {
        showChatStatus('Чат не найден.', true);
        showValidationError('Чат не найден.');
        return;
      }
      if (inputError) {
        showChatStatus(inputError, true);
        showValidationError(inputError);
        return;
      }

      button.disabled = true;
      fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          init_data: currentInitData(),
          chat_id: positiveId(chatId),
          text: text
        })
      })
        .then(function (response) {
          return readJson(response);
        })
        .then(function (data) {
          if (!data || data.ok !== true) {
            showChatStatus((data && data.error) || 'Не удалось отправить сообщение.', true);
            showValidationError((data && data.error) || 'Не удалось отправить сообщение.');
            return;
          }
          input.value = '';
          showChatStatus('', false);
          showSuccessMessage('Сообщение отправлено.');
          loadChatMessages(true);
        })
        .catch(function (error) {
          if (!alreadyTold(error)) {
            showChatStatus('Не удалось связаться с сервером.', true);
            showValidationError('Не удалось связаться с сервером.');
          } else {
            showChatStatus(error.message, true);
          }
        })
        .then(function () {
          enableIfOnline(button);
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
    text.textContent = decodeSavedText(message.text);

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
    var timeInput = walkForm.scheduled_at;
    if (timeInput) {
      var earliest = new Date(Date.now() + 15 * 60 * 1000);
      var padTime = function (number) {
        return number < 10 ? '0' + number : String(number);
      };
      timeInput.min = earliest.getFullYear() + '-' + padTime(earliest.getMonth() + 1) + '-' + padTime(earliest.getDate()) + 'T' + padTime(earliest.getHours()) + ':' + padTime(earliest.getMinutes());
    }
    var matchId = 0;

    if (back && chatId > 0) {
      back.href = 'chat.html?chat_id=' + encodeURIComponent(chatId);
    }
    if (!chatId || chatId < 1) {
      showWalkStatus('Не указан чат.', true);
      submitButton.disabled = true;
      return;
    }

    fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=list&chat_id=' + encodeURIComponent(chatId) + '&tg_id=' + encodeURIComponent(currentTgId())))
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
      .catch(function (error) {
        if (!alreadyTold(error)) {
          showWalkStatus('Не удалось связаться с сервером.', true);
        } else {
          showWalkStatus(error.message, true);
        }
        submitButton.disabled = true;
        submitButton.removeAttribute('data-network-lock');
      });

    walkForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var place = walkForm.place.value.trim();
      var scheduledAt = walkTimeValue(walkForm.scheduled_at.value);
      var inputError = '';
      if (!positiveId(matchId)) {
        inputError = 'Чат ещё не загрузился.';
      } else {
        inputError = placeError(place) || walkTimeError(walkForm.scheduled_at.value);
      }
      if (inputError) {
        showWalkStatus(inputError, true);
        showValidationError(inputError);
        return;
      }

      submitButton.disabled = true;
      showWalkStatus('Сохраняем...', false);
      fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: positiveId(matchId),
          tg_id: currentTgId(),
          init_data: currentInitData(),
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
            showValidationError((data && data.error) || 'Не удалось предложить прогулку.');
            enableIfOnline(submitButton);
            return;
          }
          showSuccessMessage('Прогулка предложена.');
          window.setTimeout(function () {
            window.location.href = 'chat.html?chat_id=' + encodeURIComponent(chatId);
          }, 700);
        })
        .catch(function (error) {
          if (!alreadyTold(error)) {
            showWalkStatus('Не удалось связаться с сервером.', true);
            showValidationError('Не удалось связаться с сервером.');
          } else {
            showWalkStatus(error.message, true);
          }
          enableIfOnline(submitButton);
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
      var inputError = '';
      if (!positiveId(walkId) || !positiveId(aboutDogId)) {
        inputError = 'Не указана прогулка.';
      } else {
        inputError = ratingError(rating) || reviewTextError(text);
      }
      if (inputError) {
        showReviewStatus(inputError, true);
        showValidationError(inputError);
        return;
      }

      submitButton.disabled = true;
      showReviewStatus('Сохраняем...', false);
      fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/reviews.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: currentTgId(),
          init_data: currentInitData(),
          walk_id: positiveId(walkId),
          about_dog_id: positiveId(aboutDogId),
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
            showValidationError((data && data.error) || 'Не удалось отправить отзыв.');
            enableIfOnline(submitButton);
            return;
          }
          showReviewStatus('Спасибо за отзыв!', false);
          showSuccessMessage('Спасибо за отзыв!');
          window.setTimeout(function () {
            window.location.href = backHref;
          }, 700);
        })
        .catch(function (error) {
          if (!alreadyTold(error)) {
            showReviewStatus('Не удалось связаться с сервером.', true);
            showValidationError('Не удалось связаться с сервером.');
          } else {
            showReviewStatus(error.message, true);
          }
          enableIfOnline(submitButton);
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

  function currentInitData() {
    var tgApp = window.Telegram && window.Telegram.WebApp;
    return tgApp && typeof tgApp.initData === 'string' ? tgApp.initData : '';
  }

  function withInitData(url) {
    var initData = currentInitData();
    if (!initData) {
      return url;
    }
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'init_data=' + encodeURIComponent(initData);
  }

  function charLength(value) {
    return Array.from(String(value || '')).length;
  }

  function dogNameError(value) {
    var text = String(value || '').trim();
    var length = charLength(text);
    if (length < 2) {
      return 'Имя должно содержать минимум 2 символа.';
    }
    if (length > 30) {
      return 'Имя не длиннее 30 символов.';
    }
    if (!/^[\p{L}\s\-]+$/u.test(text)) {
      return 'В имени можно использовать только буквы, пробелы и дефисы.';
    }
    return '';
  }

  function breedError(value) {
    var text = String(value || '').trim();
    var length = charLength(text);
    if (length < 2) {
      return 'Порода должна содержать минимум 2 символа.';
    }
    if (length > 50) {
      return 'Порода не длиннее 50 символов.';
    }
    if (!/^[\p{L}\s\-]+$/u.test(text)) {
      return 'В породе можно использовать только буквы, пробелы и дефисы.';
    }
    return '';
  }

  function weightError(value) {
    var text = String(value || '').trim();
    var number = Number(text);
    if (!/^\d+(\.\d+)?$/.test(text) || number < 0.5 || number > 150) {
      return 'Вес должен быть числом от 0.5 до 150 кг.';
    }
    return '';
  }

  function activityError(value) {
    if (!/^[1-5]$/.test(String(value || '').trim())) {
      return 'Выберите активность от 1 до 5.';
    }
    return '';
  }

  function coordError(lat, lon) {
    var latText = String(lat).trim();
    var lonText = String(lon).trim();
    var latN = Number(latText);
    var lonN = Number(lonText);
    if (latText === '' || !isFinite(latN) || latN < -90 || latN > 90) {
      return 'Широта должна быть числом от -90 до 90.';
    }
    if (lonText === '' || !isFinite(lonN) || lonN < -180 || lonN > 180) {
      return 'Долгота должна быть числом от -180 до 180.';
    }
    return '';
  }

  function chatTextError(value) {
    var raw = String(value || '');
    var text = raw.trim();
    if (text === '' && raw !== '') {
      return 'Сообщение не может состоять только из пробелов.';
    }
    if (text === '') {
      return 'Введите текст сообщения.';
    }
    if (charLength(text) > 1000) {
      return 'Сообщение не длиннее 1000 символов.';
    }
    return '';
  }

  function placeError(value) {
    var text = String(value || '').trim();
    var length = charLength(text);
    if (length < 3) {
      return 'Место встречи — минимум 3 символа.';
    }
    if (length > 100) {
      return 'Место встречи не длиннее 100 символов.';
    }
    if (!/^[\p{L}\d\s,\-]+$/u.test(text)) {
      return 'В месте встречи можно использовать буквы, цифры, пробелы, запятые и дефисы.';
    }
    return '';
  }

  function walkTimeValue(value) {
    var text = String(value || '').trim().replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
      text += ':00';
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
      return '';
    }
    return text;
  }

  function walkTimeError(value) {
    var text = walkTimeValue(value);
    if (!text) {
      return 'Укажите дату и время прогулки.';
    }
    var parts = text.split(/[- :]/);
    var when = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(parts[3]), Number(parts[4]), Number(parts[5]));
    if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return 'Дата прогулки должна быть в будущем.';
    }
    if (when.getTime() < Date.now() + 15 * 60 * 1000) {
      return 'Прогулку можно назначить минимум через 15 минут.';
    }
    return '';
  }

  function reviewTextError(value) {
    var raw = String(value || '');
    var text = raw.trim();
    if (text === '' && raw !== '') {
      return 'Отзыв не может состоять только из пробелов.';
    }
    var length = charLength(text);
    if (length < 10) {
      return 'Отзыв должен содержать минимум 10 символов.';
    }
    if (length > 1000) {
      return 'Отзыв не длиннее 1000 символов.';
    }
    return '';
  }

  function ratingError(value) {
    if (!/^[1-5]$/.test(String(value))) {
      return 'Поставьте оценку от 1 до 5.';
    }
    return '';
  }

  function positiveId(value) {
    var number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
  }

  var pendingRequests = [];

  function checkNetworkStatus() {
    var online = navigator.onLine !== false;
    var banner = document.getElementById('network-banner');
    var dot = document.getElementById('network-indicator');
    if (online) {
      document.body.classList.remove('offline');
      if (banner) {
        banner.classList.add('hidden');
      }
      if (dot) {
        dot.classList.add('online');
        dot.classList.remove('offline');
      }
      setSubmitLocked(false);
      return;
    }
    document.body.classList.add('offline');
    if (banner) {
      banner.classList.remove('hidden');
    }
    if (dot) {
      dot.classList.add('offline');
      dot.classList.remove('online');
    }
    setSubmitLocked(true);
  }

  function setSubmitLocked(locked) {
    var buttons = document.querySelectorAll('form button[type="submit"]');
    Array.prototype.forEach.call(buttons, function (button) {
      if (locked) {
        if (!button.disabled) {
          button.setAttribute('data-network-lock', '1');
          button.disabled = true;
        }
        return;
      }
      if (button.getAttribute('data-network-lock') === '1') {
        button.disabled = false;
        button.removeAttribute('data-network-lock');
      }
    });
  }

  function queueRequest(url, options) {
    if (String(url).indexOf('cloudinary.com') !== -1) {
      return;
    }
    var method = options && options.method ? String(options.method).toUpperCase() : 'GET';
    var body = '';
    if (options && typeof options.body === 'string') {
      body = options.body;
    } else if (options && options.body) {
      body = 'file-' + Date.now();
    }
    var key = method + ' ' + url + ' ' + body;
    var index;
    for (index = 0; index < pendingRequests.length; index += 1) {
      if (pendingRequests[index].key === key) {
        return;
      }
    }
    pendingRequests.push({
      key: key,
      url: url,
      options: options || {},
      resolve: null,
      reject: null
    });
  }

  function replayPending() {
    var queue = pendingRequests.slice();
    pendingRequests = [];
    var writes = [];
    var index;
    for (index = 0; index < queue.length; index += 1) {
      var method = queue[index].options && queue[index].options.method ? String(queue[index].options.method).toUpperCase() : 'GET';
      if (method !== 'GET') {
        writes.push(queue[index]);
      }
    }
    var sent = 0;
    var chain = Promise.resolve();
    writes.forEach(function (item) {
      chain = chain.then(function () {
        return fetchWithNetworkCheck(item.url, item.options).then(function (response) {
          if (response && response.ok) {
            sent += 1;
          }
        }).catch(function () {});
      });
    });
    chain.then(function () {
      refreshAfterReconnect();
      if (sent > 0) {
        showSuccessMessage('Отправлено ' + sent + ' сохранённых запросов');
      }
    });
  }

  function refreshAfterReconnect() {
    if (document.querySelector('#feed-container .load-error')) {
      loadFeed();
    }
    var chats = document.getElementById('chats-list');
    if (chats && chats.querySelector('.load-error')) {
      loadMyChats(chats);
    }
    var walks = document.getElementById('walks-list');
    if (walks && walks.querySelector('.load-error')) {
      loadMyWalks(walks);
    }
    if (document.querySelector('#dashboard-container .load-error')) {
      loadHome();
    }
    if (document.querySelector('#profile-container .load-error')) {
      loadProfile();
    }
    window.dispatchEvent(new Event('dogbuddy-online'));
  }

  function alreadyTold(error) {
    return !!(error && (error.type === 'network_offline' || error.type === 'timeout' || error.type === 'http'));
  }

  function enableIfOnline(button) {
    if (!button) {
      return;
    }
    if (navigator.onLine === false) {
      button.setAttribute('data-network-lock', '1');
      button.disabled = true;
      return;
    }
    button.disabled = false;
    button.removeAttribute('data-network-lock');
  }

  function fetchWithNetworkCheck(url, options) {
    var offlineError = new Error('Нет интернета. Проверьте подключение');
    offlineError.type = 'network_offline';
    if (navigator.onLine === false) {
      showValidationError(offlineError.message);
      queueRequest(url, options);
      return Promise.reject(offlineError);
    }
    var opts = options ? Object.assign({}, options) : {};
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) {
      opts.signal = controller.signal;
    }
    var timer = setTimeout(function () {
      if (controller) {
        controller.abort();
      }
    }, 15000);
    return window.fetch(url, opts).then(function (response) {
      clearTimeout(timer);
      return response;
    }).catch(function (error) {
      clearTimeout(timer);
      if (error && error.name === 'AbortError') {
        var timeoutError = new Error('Превышено время ожидания. Попробуйте снова');
        timeoutError.type = 'timeout';
        showValidationError(timeoutError.message);
        return Promise.reject(timeoutError);
      }
      if (navigator.onLine === false) {
        showValidationError(offlineError.message);
        if (!options || typeof options.body === 'string' || !options.body) {
          queueRequest(url, options);
        }
        return Promise.reject(offlineError);
      }
      return Promise.reject(error);
    });
  }

  function buildLoader(compact) {
    var wrap = document.createElement('div');
    wrap.className = compact ? 'loader-container loader-compact' : 'loader-container';
    var spinner = document.createElement('div');
    spinner.className = 'spinner';
    var text = document.createElement('div');
    text.className = 'loader-text';
    text.textContent = 'Загрузка...';
    wrap.appendChild(spinner);
    wrap.appendChild(text);
    return wrap;
  }

  function showLoader(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    var compact = containerId === 'messages-container';
    if (container.getAttribute('data-keep') === '1') {
      showLoadingOverlay(containerId);
      if (!container.querySelector('.loader-container')) {
        container.insertBefore(buildLoader(compact), container.firstChild);
      }
      return;
    }
    container.textContent = '';
    container.appendChild(buildLoader(compact));
  }

  function hideLoader(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    if (container.getAttribute('data-keep') === '1') {
      var loader = container.querySelector('.loader-container');
      if (loader) {
        loader.remove();
      }
      hideLoadingOverlay(containerId);
      return;
    }
    container.textContent = '';
  }

  function showLoadingOverlay(containerId) {
    var container = document.getElementById(containerId);
    if (!container || container.querySelector('.loading-overlay')) {
      return;
    }
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    var overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    var spinner = document.createElement('div');
    spinner.className = 'spinner';
    overlay.appendChild(spinner);
    container.appendChild(overlay);
  }

  function hideLoadingOverlay(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    var overlay = container.querySelector('.loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  function showLoadError(containerId, retry, message) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    var box = document.createElement('div');
    box.className = 'load-error';
    var text = document.createElement('p');
    text.className = 'loader-text';
    text.textContent = message || 'Не удалось загрузить данные. Проверьте интернет и попробуйте снова';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-primary load-retry';
    button.textContent = 'Повторить';
    button.addEventListener('click', function () {
      retry();
    });
    box.appendChild(text);
    box.appendChild(button);
    if (container.getAttribute('data-keep') === '1') {
      hideLoader(containerId);
      var old = container.querySelector('.load-error');
      if (old) {
        old.remove();
      }
      container.insertBefore(box, container.firstChild);
      return;
    }
    container.textContent = '';
    container.appendChild(box);
  }

  function loadProfile() {
    showLoader('profile-container');
    document.body.classList.add('is-checking');
    fetchMyDog().then(function (data) {
      hideLoader('profile-container');
      document.body.classList.remove('is-checking');
      if (data && data.ok === true && data.has_dog) {
        if (data.dog_id) {
          rememberDogId(data.dog_id);
        }
        fillProfile(data);
        return;
      }
      if (data && data.ok === true) {
        window.location.replace('index.html');
        return;
      }
      showLoadError('profile-container', loadProfile);
    });
  }

  function showNotice(message, className, hideAfter) {
    var old = document.querySelector('.toast-error, .toast-success');
    if (old) {
      old.remove();
    }
    var node = document.createElement('div');
    node.className = className;
    node.setAttribute('role', 'alert');
    node.textContent = message;
    document.body.appendChild(node);
    window.setTimeout(function () {
      node.classList.add('toast-hide');
      window.setTimeout(function () {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }, 300);
    }, hideAfter);
  }

  function showValidationError(message) {
    var now = Date.now();
    if ((message === 'Нет интернета. Проверьте подключение' || message === 'Превышено время ожидания. Попробуйте снова')
      && showValidationError.last === message
      && now - showValidationError.at < 8000) {
      return;
    }
    showValidationError.last = message;
    showValidationError.at = now;
    showNotice(message, 'toast-error', 5000);
  }

  function showSuccessMessage(message) {
    showNotice(message, 'toast-success', 3000);
  }

  function decodeSavedText(value) {
    return String(value || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function safePhotoUrl(url) {
    var value = String(url || '');
    if (value.indexOf('https://res.cloudinary.com/') === 0 || value.indexOf('https://via.placeholder.com/') === 0) {
      return value;
    }
    return 'https://via.placeholder.com/300x300?text=No+Photo';
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

  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WALK_STATUS = {
    proposed: ['Ждёт подтверждения', 'status-proposed'],
    confirmed: ['Подтверждена', 'status-confirmed'],
    done: ['Завершена', 'status-done'],
    cancelled: ['Отменена', 'status-cancelled']
  };

  function markChatAsRead(chatId) {
    return fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=mark_as_read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tg_id: currentTgId(),
        init_data: currentInitData(),
        chat_id: positiveId(chatId)
      })
    }).then(readJson);
  }

  function loadMyChats(list) {
    showLoader('chats-list');
    fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/chats.php?action=my_chats&tg_id=' + encodeURIComponent(currentTgId())))
      .then(readJson)
      .then(function (data) {
        if (!data || data.ok !== true) {
          showLoadError('chats-list', function () {
            loadMyChats(list);
          }, data && data.error);
          return;
        }
        if (data.my_dog_id) {
          rememberDogId(data.my_dog_id);
        }
        renderChatList(list, data.chats || []);
      })
      .catch(function () {
        showLoadError('chats-list', function () {
          loadMyChats(list);
        });
      });
  }

  function renderChatList(list, chats) {
    list.textContent = '';
    if (!chats.length) {
      list.appendChild(emptyState(
        'Пока нет чатов. Найдите друзей в разделе Найти друзей!',
        'Найти друзей',
        'feed.html'
      ));
      return;
    }
    chats.forEach(function (chat) {
      var unread = Number(chat.unread_count) || 0;
      var card = document.createElement('a');
      card.className = unread > 0 ? 'list-card chat-card unread' : 'list-card chat-card';
      card.href = 'chat.html?chat_id=' + encodeURIComponent(chat.chat_id);
      card.appendChild(avatarImage(chat.partner_photo, chat.partner_name));
      var body = document.createElement('span');
      body.className = 'list-body';
      var top = document.createElement('span');
      top.className = 'list-top';
      var name = document.createElement('span');
      name.className = 'list-name';
      name.textContent = chat.partner_name || 'Собеседник';
      var time = document.createElement('span');
      time.className = 'list-time';
      time.textContent = formatChatTime(chat.last_at);
      top.appendChild(name);
      top.appendChild(time);
      var preview = document.createElement('span');
      preview.className = 'list-preview';
      preview.textContent = chat.last_text ? decodeSavedText(chat.last_text) : 'Нет сообщений';
      body.appendChild(top);
      body.appendChild(preview);
      card.appendChild(body);
      if (unread > 0) {
        var badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unread > 99 ? '99+' : String(unread);
        card.appendChild(badge);
        card.addEventListener('click', function (event) {
          event.preventDefault();
          markChatAsRead(chat.chat_id).then(function (data) {
            if (!data || data.ok !== true) {
              showValidationError((data && data.error) || 'Не удалось отметить сообщения прочитанными.');
            }
            loadMyChats(list);
            window.location.href = card.href;
          }).catch(function () {
            window.location.href = card.href;
          });
        });
      }
      list.appendChild(card);
    });
  }

  function loadMyWalks(list) {
    showLoader('walks-list');
    fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=my_walks&tg_id=' + encodeURIComponent(currentTgId())))
      .then(readJson)
      .then(function (data) {
        if (!data || data.ok !== true) {
          showLoadError('walks-list', function () {
            loadMyWalks(list);
          }, data && data.error);
          return;
        }
        if (data.my_dog_id) {
          rememberDogId(data.my_dog_id);
        }
        renderWalkList(list, data.walks || [], Number(data.my_dog_id) || currentDogId());
      })
      .catch(function () {
        showLoadError('walks-list', function () {
          loadMyWalks(list);
        });
      });
  }

  function renderWalkList(list, walks, myDogId) {
    list.textContent = '';
    if (!walks.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Пока нет прогулок. Они появятся, когда вы договоритесь с другом в чате';
      list.appendChild(empty);
      return;
    }
    walks.forEach(function (walk) {
      list.appendChild(createWalkCard(list, walk, myDogId));
    });
  }

  function createWalkCard(list, walk, myDogId) {
    var card = document.createElement('article');
    card.className = 'list-card list-card-column';
    var top = document.createElement('div');
    top.className = 'list-top';
    var who = document.createElement('div');
    who.className = 'flex items-center gap-2';
    who.appendChild(avatarImage(walk.partner_photo, walk.partner_name));
    var name = document.createElement('span');
    name.className = 'list-name';
    name.textContent = walk.partner_name || 'Собеседник';
    who.appendChild(name);
    var status = WALK_STATUS[walk.status] || [walk.status, 'status-done'];
    var badge = document.createElement('span');
    badge.className = 'status-badge ' + status[1];
    badge.textContent = status[0];
    top.appendChild(who);
    top.appendChild(badge);
    card.appendChild(top);

    var place = document.createElement('p');
    place.className = 'list-place';
    place.textContent = walk.place || 'Место не указано';
    var when = document.createElement('p');
    when.className = 'list-when hint';
    when.textContent = formatWalkWhen(walk.scheduled_at);
    card.appendChild(place);
    card.appendChild(when);

    if (walk.status === 'proposed' && Number(walk.proposer_id) !== Number(myDogId)) {
      var actions = document.createElement('div');
      actions.className = 'list-actions';
      actions.appendChild(walkActionButton(list, walk, 'confirmed', 'Подтвердить', 'btn-primary'));
      actions.appendChild(walkActionButton(list, walk, 'cancelled', 'Отклонить', 'btn-secondary'));
      card.appendChild(actions);
    } else if (walk.status === 'proposed') {
      var waiting = document.createElement('p');
      waiting.className = 'hint mt-2';
      waiting.textContent = 'Ждём подтверждения собеседника';
      card.appendChild(waiting);
    }
    return card;
  }

  function walkActionButton(list, walk, status, label, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', function () {
      var walkId = positiveId(walk.walk_id);
      if (!walkId || (status !== 'confirmed' && status !== 'cancelled')) {
        showValidationError('Не удалось обновить прогулку.');
        return;
      }
      button.disabled = true;
      fetchWithNetworkCheck('https://pereskazka-ai.ru/dogbuddy/api/walks.php?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walk_id: walkId,
          status: status,
          tg_id: currentTgId(),
          init_data: currentInitData()
        })
      })
        .then(readJson)
        .then(function (data) {
          if (!data || data.ok !== true) {
            enableIfOnline(button);
            showValidationError((data && data.error) || 'Не удалось обновить прогулку.');
            return;
          }
          showSuccessMessage('Прогулка обновлена.');
          loadMyWalks(list);
        })
        .catch(function (error) {
          enableIfOnline(button);
          if (!alreadyTold(error)) {
            showValidationError('Не удалось связаться с сервером.');
          }
        });
    });
    return button;
  }

  function emptyState(text, buttonText, href) {
    var box = document.createElement('section');
    box.className = 'card flex flex-col gap-4 p-4';
    var message = document.createElement('p');
    message.textContent = text;
    var link = document.createElement('a');
    link.className = 'btn-primary no-underline';
    link.href = href;
    link.textContent = buttonText;
    box.appendChild(message);
    box.appendChild(link);
    return box;
  }

  function avatarImage(url, name) {
    var image = document.createElement('img');
    image.className = 'list-avatar';
    image.alt = name || 'Собака';
    image.src = safePhotoUrl(url);
    image.addEventListener('error', function () {
      if (image.getAttribute('data-fallback') === '1') {
        return;
      }
      image.setAttribute('data-fallback', '1');
      image.src = 'https://via.placeholder.com/300x300?text=No+Photo';
    });
    return image;
  }

  function formatWalkWhen(value) {
    var parts = dateParts(value);
    if (!parts) {
      return value || '';
    }
    return Number(parts[2]) + ' ' + (MONTHS[Number(parts[1]) - 1] || '') + ', ' + parts[3] + ':' + parts[4];
  }

  function formatChatTime(value) {
    var parts = dateParts(value);
    if (!parts) {
      return '';
    }
    var now = new Date();
    var sameDay = now.getFullYear() === Number(parts[0]) && (now.getMonth() + 1) === Number(parts[1]) && now.getDate() === Number(parts[2]);
    if (sameDay) {
      return parts[3] + ':' + parts[4];
    }
    return Number(parts[2]) + ' ' + (MONTHS[Number(parts[1]) - 1] || '');
  }

  function dateParts(value) {
    var text = String(value || '').replace('T', ' ');
    var parts = text.split(/[- :]/);
    if (parts.length < 5) {
      return null;
    }
    return parts;
  }

  function fetchMyDog() {
    return fetchWithNetworkCheck(withInitData('https://pereskazka-ai.ru/dogbuddy/api/dogs.php?action=me&tg_id=' + encodeURIComponent(currentTgId())))
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

    showLoader('dashboard-container');
    menu.classList.add('is-hidden');
    registerBlock.classList.add('is-hidden');
    if (retry) {
      retry.classList.add('is-hidden');
    }
    if (homeStatus) {
      homeStatus.textContent = '';
    }

    fetchMyDog().then(function (data) {
      hideLoader('dashboard-container');
      if (!data || data.ok !== true) {
        showLoadError('dashboard-container', loadHome, data && data.error);
        if (homeStatus) {
          homeStatus.textContent = '';
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
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        data = null;
      }
      if (data && typeof data === 'object') {
        if (response && response.ok === false && !data.error) {
          var httpError = new Error('Сервер ответил с ошибкой. Попробуйте ещё раз.');
          httpError.type = 'http';
          showValidationError(httpError.message);
          throw httpError;
        }
        return data;
      }
      if (response && response.ok === false) {
        var statusError = new Error('Сервер ответил с ошибкой. Попробуйте ещё раз.');
        statusError.type = 'http';
        showValidationError(statusError.message);
        throw statusError;
      }
      throw new Error('bad json');
    });
  }
});
