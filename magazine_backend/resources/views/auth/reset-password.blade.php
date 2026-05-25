<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reinitialiser le mot de passe</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            font-family: Arial, Helvetica, sans-serif;
            background: linear-gradient(135deg, #0f172a, #1e3a8a);
        }

        .card {
            width: min(100%, 460px);
            background: #ffffff;
            border-radius: 24px;
            padding: 32px 24px;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
        }

        h1 {
            margin: 0 0 12px;
            font-size: 28px;
            color: #0f172a;
            text-align: center;
        }

        p {
            margin: 0 0 24px;
            text-align: center;
            color: #475569;
            line-height: 1.5;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #0f172a;
            font-weight: 700;
        }

        input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 14px 16px;
            margin-bottom: 16px;
            font-size: 14px;
        }

        .password-field {
            position: relative;
            margin-bottom: 16px;
        }

        .password-field input {
            margin-bottom: 0;
            padding-right: 52px;
        }

        .toggle-password {
            position: absolute;
            top: 50%;
            right: 14px;
            transform: translateY(-50%);
            width: auto;
            padding: 0;
            border: 0;
            background: transparent;
            color: #64748b;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .toggle-password:hover {
            color: #2563eb;
        }

        .toggle-password.is-visible {
            color: #2563eb;
        }

        .toggle-password svg {
            width: 20px;
            height: 20px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        button {
            width: 100%;
            border: 0;
            border-radius: 14px;
            padding: 14px 16px;
            background: linear-gradient(135deg, #06b6d4, #2563eb);
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
        }

        button:disabled {
            opacity: 0.7;
            cursor: wait;
        }

        .message {
            display: none;
            margin-bottom: 16px;
            border-radius: 14px;
            padding: 12px 14px;
            font-size: 14px;
        }

        .message.is-visible {
            display: block;
        }

        .message.is-success {
            background: #dcfce7;
            color: #166534;
        }

        .message.is-error {
            background: #fee2e2;
            color: #991b1b;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Reinitialiser le mot de passe</h1>
        <p>Choisissez un nouveau mot de passe pour le compte lie a cette adresse e-mail.</p>

        <div id="message" class="message"></div>

        <form id="reset-form">
            <input type="hidden" id="token" value="{{ $token }}">

            <label for="email">Adresse e-mail</label>
            <input type="email" id="email" value="{{ $email }}" required>

            <label for="password">Nouveau mot de passe</label>
            <div class="password-field">
                <input type="password" id="password" minlength="6" required>
                <button type="button" class="toggle-password" data-target="password" aria-label="Afficher le mot de passe">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84"></path>
                        <path d="M9.88 5.09A9.77 9.77 0 0 1 12 4.8c5.4 0 9.27 4.38 10 5.2a14.7 14.7 0 0 1-4.04 3.32"></path>
                        <path d="M6.61 6.61A14.12 14.12 0 0 0 2 10c.73.82 4.6 5.2 10 5.2a9.8 9.8 0 0 0 3.02-.47"></path>
                    </svg>
                </button>
            </div>

            <label for="password_confirmation">Confirmation du mot de passe</label>
            <div class="password-field">
                <input type="password" id="password_confirmation" minlength="6" required>
                <button type="button" class="toggle-password" data-target="password_confirmation" aria-label="Afficher la confirmation du mot de passe">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84"></path>
                        <path d="M9.88 5.09A9.77 9.77 0 0 1 12 4.8c5.4 0 9.27 4.38 10 5.2a14.7 14.7 0 0 1-4.04 3.32"></path>
                        <path d="M6.61 6.61A14.12 14.12 0 0 0 2 10c.73.82 4.6 5.2 10 5.2a9.8 9.8 0 0 0 3.02-.47"></path>
                    </svg>
                </button>
            </div>

            <button type="submit" id="submit-button">Mettre a jour le mot de passe</button>
        </form>
    </div>

    <script>
        const form = document.getElementById('reset-form');
        const button = document.getElementById('submit-button');
        const messageBox = document.getElementById('message');
        const apiUrl = @json($apiUrl);
        const toggleButtons = document.querySelectorAll('.toggle-password');
        const eyeOpenIcon = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"></path>
                <circle cx="12" cy="12" r="2.8"></circle>
            </svg>
        `;
        const eyeClosedIcon = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18"></path>
                <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84"></path>
                <path d="M9.88 5.09A9.77 9.77 0 0 1 12 4.8c5.4 0 9.27 4.38 10 5.2a14.7 14.7 0 0 1-4.04 3.32"></path>
                <path d="M6.61 6.61A14.12 14.12 0 0 0 2 10c.73.82 4.6 5.2 10 5.2a9.8 9.8 0 0 0 3.02-.47"></path>
            </svg>
        `;

        const showMessage = (text, type) => {
            messageBox.textContent = text;
            messageBox.className = `message is-visible ${type === 'success' ? 'is-success' : 'is-error'}`;
        };

        toggleButtons.forEach((toggleButton) => {
            toggleButton.addEventListener('click', () => {
                const targetId = toggleButton.dataset.target;
                const input = document.getElementById(targetId);
                const isPassword = input.type === 'password';

                input.type = isPassword ? 'text' : 'password';
                toggleButton.classList.toggle('is-visible', isPassword);
                toggleButton.innerHTML = isPassword ? eyeOpenIcon : eyeClosedIcon;
                toggleButton.setAttribute(
                    'aria-label',
                    isPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                );
            });
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            button.disabled = true;

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        token: document.getElementById('token').value,
                        email: document.getElementById('email').value,
                        password: document.getElementById('password').value,
                        password_confirmation: document.getElementById('password_confirmation').value,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    const firstError = data.errors ? Object.values(data.errors)[0][0] : null;
                    throw new Error(firstError || data.message || 'La reinitialisation a echoue.');
                }

                showMessage('Votre mot de passe a ete reinitialise avec succes. Vous pouvez maintenant revenir a la page de connexion.', 'success');
                form.reset();
            } catch (error) {
                showMessage(error.message || 'La reinitialisation a echoue.', 'error');
            } finally {
                button.disabled = false;
            }
        });
    </script>
</body>
</html>
