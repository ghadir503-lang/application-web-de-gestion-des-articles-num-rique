import { render, screen } from '@testing-library/react';
import App from './App';

// Verifie que l'application se rend correctement dans l'environnement de test.
test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
