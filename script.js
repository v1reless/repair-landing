// ============================================================
// Лендинг: форма заявки, валидация и отправка
// ============================================================

// Куда отправлять заявки.
//
// 1. Локальный Telegram-бот:
//    запустите `npm start` в папке `telegram-bot` и откройте
//    http://127.0.0.1:8787/ — сервер сам подставит /api/lead.
//
// 2. Formspree или другой backend:
//    вставьте URL endpoint в FORM_ENDPOINT_OVERRIDE ниже.
//
// 3. GitHub Pages:
//    это статический сайт, поэтому без внешнего backend
//    форма работает в демо-режиме.
const FORM_ENDPOINT_OVERRIDE = '';

const endpointMeta = document.querySelector('meta[name="form-endpoint"]');
const FORM_ENDPOINT = FORM_ENDPOINT_OVERRIDE || (endpointMeta?.content.trim() ?? '');

const form = document.getElementById('lead-form');
const formStatus = document.getElementById('form-status');
const formNote = document.getElementById('form-note');
const submitButton = form.querySelector('button[type="submit"]');
const fields = [...form.querySelectorAll('input, select, textarea')];
const yearElement = document.getElementById('year');

// Если endpoint подключён, демо-подпись под формой не нужна.
if (FORM_ENDPOINT) {
  formNote.hidden = true;
}

/**
 * Показывает сообщение под формой.
 * @param {string} message
 * @param {'success'|'error'} type
 */
function setStatus(message, type) {
  formStatus.textContent = message;
  formStatus.className = `form__status form__status--${type}`;
  formStatus.hidden = false;
}

function clearStatus() {
  formStatus.textContent = '';
  formStatus.className = 'form__status';
  formStatus.hidden = true;
}

/**
 * Показывает или убирает ошибку конкретного поля.
 * @param {HTMLElement} field
 * @param {string} message — пустая строка убирает ошибку
 */
function setFieldError(field, message) {
  const errorElement = document.getElementById(`${field.id}-error`);
  if (!errorElement) return;

  if (message) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorElement.id);
    errorElement.textContent = message;
    errorElement.hidden = false;
  } else {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    errorElement.textContent = '';
    errorElement.hidden = true;
  }
}

function clearAllErrors() {
  fields.forEach((field) => setFieldError(field, ''));
}

/**
 * Проверяет одно поле и возвращает текст ошибки или пустую строку.
 * @param {HTMLElement} field
 * @returns {string}
 */
function validateField(field) {
  const value = field.type === 'checkbox' ? field.checked : field.value.trim();

  if (field.id === 'name' && value.length < 2) {
    return 'Укажите имя — хотя бы 2 символа.';
  }

  if (field.id === 'phone') {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length < 10) {
      return 'Укажите телефон в формате +7 (999) 000-00-00.';
    }
  }

  if (field.id === 'service' && !value) {
    return 'Выберите вид работ.';
  }

  if (field.id === 'consent' && !value) {
    return 'Нужно согласие на обработку данных.';
  }

  return '';
}

/**
 * Проверяет всю форму и возвращает список невалидных полей.
 * @returns {HTMLElement[]}
 */
function validateForm() {
  const invalidFields = [];

  fields.forEach((field) => {
    const message = validateField(field);
    setFieldError(field, message);

    if (message) {
      invalidFields.push(field);
    }
  });

  return invalidFields;
}

// ---------- Очистка ошибок при вводе ----------
['input', 'change'].forEach((eventName) => {
  form.addEventListener(eventName, (event) => {
    const field = event.target;

    if (fields.includes(field)) {
      setFieldError(field, '');
      clearStatus();
    }
  });
});

// ---------- Отправка ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus();

  const invalidFields = validateForm();

  if (invalidFields.length > 0) {
    setStatus('Проверьте выделенные поля.', 'error');
    invalidFields[0].focus();
    return;
  }

  const formData = new FormData(form);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    service: String(formData.get('service') || ''),
    message: String(formData.get('message') || '').trim(),
    consent: formData.get('consent') === 'on',
    _subject: 'Новая заявка с лендинга МастерДом',
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Отправляю…';

  try {
    if (FORM_ENDPOINT) {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        throw new Error(`HTTP ${response.status}`);
      }
    } else {
      // Демо-режим: имитируем отправку, никуда не отправляя данные.
      await new Promise((resolve) => setTimeout(resolve, 700));
      console.info('Демо-заявка:', payload);
    }

    form.reset();
    clearAllErrors();

    if (FORM_ENDPOINT) {
      setStatus('Спасибо! Заявка отправлена. Перезвоним в течение 15 минут.', 'success');
    } else {
      setStatus(
        'Спасибо! Демо-отправка прошла успешно. Подключите Formspree, чтобы получать заявки.',
        'success'
      );
    }
  } catch (error) {
    console.error('Не удалось отправить заявку:', error);
    setStatus(
      'Не удалось отправить заявку. Позвоните нам: +7 (999) 000-00-00.',
      'error'
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Получить расчёт';
  }
});

// ---------- Год в подвале ----------
yearElement.textContent = new Date().getFullYear();
