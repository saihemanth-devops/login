describe('Smoke Test', () => {
  it('Checks if login page loads correctly', () => {
    cy.visit('/');

    cy.contains('DevSecOps Login Page');

    cy.get('#username').should('exist');
    cy.get('#password').should('exist');
    cy.contains('button', 'Login').should('exist');
  });
});

