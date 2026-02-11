
# ACCEPTANCE.md

Scenario: Bootstrap Support Admin Creation

Given no SUPPORT_ADMIN exists
When application starts
Then a random password is generated
And password is printed once to logs
And must_change_password = true

Scenario: Forced Password Change

Given Support Admin logs in first time
When authentication succeeds
Then user is redirected to change password
And cannot access dashboard until password updated

Scenario: Post Change

After password updated
Then must_change_password = false
And access is granted normally
