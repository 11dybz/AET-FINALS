/* Shared request headers for the same-origin app and optional ngrok endpoints. */
(() => {
  function headers(url, original = {}) {
    const result = {Accept:'application/json', ...original};
    try {
      const host = new URL(url,window.location.href).hostname;
      if (/(^|\.)ngrok(?:-free)?\.(app|dev|io)$/i.test(host)) result['ngrok-skip-browser-warning'] = '1';
    } catch (_) {}
    return result;
  }
  async function accountJson(response) {
    const text = await response.text(); let data;
    try { data = text ? JSON.parse(text) : null; }
    catch (_) {
      let message = 'The account endpoint returned a web page. Forward ngrok to the running Spring Boot port and reload.';
      if (/ERR_NGROK_6024|ngrok.{0,100}browser warning|You are about to visit/is.test(text))
        message = 'ngrok returned its browser warning. Open the tunnel link, choose Visit Site, then reload and try again.';
      else if (/ERR_NGROK_8012|failed to establish a connection to the upstream|connection refused/is.test(text))
        message = 'ngrok cannot reach Spring Boot. Start the backend and forward ngrok to the port shown in its terminal.';
      const error = new Error(message); error.status = response.status; throw error;
    }
    if (!response.ok) {
      const message = response.status === 404
        ? 'The account API was not found. Forward ngrok to the running Spring Boot port, then reload.'
        : data?.message || 'Could not complete your request.';
      const error = new Error(message); error.status = response.status; throw error;
    }
    return data;
  }
  window.RizzumeHTTP = {headers,accountJson};
})();
