import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    login_test: {
      executor: "per-vu-iterations",
      vus: 100,
      iterations: 1,
      maxDuration: "30s",
    },
  },
};

export default function () {
  const n = String(__VU).padStart(3, "0");
  const email = `rush-test-${n}@example.test`;

  const payload = JSON.stringify({
    email: email,
    password: "RushTest123!",
    returnSecureToken: true,
  });

  const res = http.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  check(res, {
    "login successful": (r) => r.status === 200,
    "received ID token": (r) => {
      try {
        return !!JSON.parse(r.body).idToken;
      } catch (e) {
        return false;
      }
    },
  });
}