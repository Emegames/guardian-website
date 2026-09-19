// =========================================
// EME GAMES - AUTENTICACIÓN
// =========================================

(function () {
  const supabase = window.EMESupabase;
  if (!supabase) return;

  function showMessage(container, message, type = "info") {
    if (!container) return;
    container.textContent = message;
    container.className = `notice auth-message ${type}`;
    container.hidden = false;
  }

  function redirectTo(path) {
    window.location.href = path;
  }

  function basePath() {
    return window.location.pathname.includes("/pages/") || window.location.pathname.includes("/admin/") ? "../" : "";
  }

  function siteRootUrl() {
    const path = window.location.pathname;
    const pagesIndex = path.indexOf("/pages/");
    const adminIndex = path.indexOf("/admin/");

    if (pagesIndex >= 0) {
      return `${window.location.origin}${path.slice(0, pagesIndex + 1)}`;
    }

    if (adminIndex >= 0) {
      return `${window.location.origin}${path.slice(0, adminIndex + 1)}`;
    }

    const lastSlash = path.lastIndexOf("/");
    return `${window.location.origin}${path.slice(0, lastSlash + 1)}`;
  }

  function publicUrl(page) {
    return `${siteRootUrl()}pages/${page}`;
  }

  async function refreshAccountUI() {
    const { data: { session } } = await supabase.auth.getSession();
    const accountLinks = document.querySelectorAll(".nav-account");
    const mobileMenus = document.querySelectorAll(".mobile-menu");

    accountLinks.forEach(el => {
      if (!session) return;
      const base = basePath();
      el.innerHTML = `
        <a href="${base}pages/perfil.html">Mi perfil</a>
        <button class="button button-primary nav-create" type="button" data-logout>Cerrar sesión</button>
      `;
    });

    mobileMenus.forEach(el => {
      if (!session) return;
      const base = basePath();
      const login = [...el.querySelectorAll("a")].find(a => a.href.includes("login.html"));
      const register = [...el.querySelectorAll("a")].find(a => a.href.includes("registro.html"));
      if (login) login.outerHTML = `<a href="${base}pages/perfil.html">Mi perfil</a>`;
      if (register) register.outerHTML = `<a href="#" data-logout>Cerrar sesión</a>`;
    });

    document.querySelectorAll("[data-logout]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error(error);
          return;
        }
        window.location.reload();
      });
    });
  }

  async function refreshDownloadUI() {
    const button = document.querySelector("[data-download-action]");
    if (!button) return;

    const { data: { session } } = await supabase.auth.getSession();
    const verified = !!session?.user?.email_confirmed_at;

    if (verified) {
      button.textContent = "Descargar juego";
      button.href = "https://github.com/Emegames/guardian-website/releases/latest/download/Guardian-Windows.zip";
      button.classList.add("button-primary");
      button.classList.remove("button-ghost");
      button.removeAttribute("data-requires-account");
      button.target = "_blank";
      button.rel = "noopener";
    } else {
      button.textContent = "Crear cuenta para descargar";
      button.href = "registro.html";
      button.classList.add("button-primary");
      button.removeAttribute("target");
      button.removeAttribute("rel");
      button.setAttribute("data-requires-account", "true");
    }
  }

  async function register() {
    const form = document.querySelector("#register-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const button = form.querySelector("button[type=submit]");
      const message = form.querySelector("[data-auth-message]");
      const name = form.querySelector("[name=name]").value.trim();
      const email = form.querySelector("[name=email]").value.trim().toLowerCase();
      const country = form.querySelector("[name=country]").value.trim();
      const password = form.querySelector("[name=password]").value;
      const confirm = form.querySelector("[name=confirm_password]").value;

      if (!name || !email || !country || !password || !confirm) {
        showMessage(message, "Completa todos los campos.", "error");
        return;
      }

      if (password.length < 8) {
        showMessage(message, "La contraseña debe tener al menos 8 caracteres.", "error");
        return;
      }

      if (password !== confirm) {
        showMessage(message, "Las contraseñas no coinciden.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Creando cuenta...";

      const redirectUrl = publicUrl("email-confirmado.html");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, country },
          emailRedirectTo: redirectUrl
        }
      });

      button.disabled = false;
      button.textContent = "Crear cuenta";

      if (error) {
        console.error(error);
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already") || msg.includes("already been registered")) {
          showMessage(message, "Este correo ya está registrado. Si no recuerdas tu contraseña, puedes recuperarla desde Iniciar sesión.", "error");
        } else {
          showMessage(message, error.message, "error");
        }
        return;
      }

      // Supabase no permite dos cuentas Auth con el mismo correo.
      // Cuando Email Confirmation está activado, un correo ya existente puede
      // devolver una respuesta sin error pero con identities vacías.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        showMessage(message, "Este correo ya está registrado. Si todavía no lo verificaste, revisa tu correo o utiliza Recuperar contraseña.", "error");
        return;
      }

      if (data.session) {
        showMessage(message, "Cuenta creada correctamente.", "success");
        setTimeout(() => redirectTo("../index.html"), 700);
      } else {
        showMessage(message, "Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación. Después aparecerá la página de correo confirmado.", "success");
        form.reset();
      }
    });
  }

  async function login() {
    const form = document.querySelector("#login-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const button = form.querySelector("button[type=submit]");
      const message = form.querySelector("[data-auth-message]");
      const email = form.querySelector("[name=email]").value.trim().toLowerCase();
      const password = form.querySelector("[name=password]").value;

      if (!email || !password) {
        showMessage(message, "Introduce tu correo y contraseña.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Iniciando sesión...";

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      button.disabled = false;
      button.textContent = "Iniciar sesión";

      if (error) {
        console.error(error);
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("email not confirmed")) {
          showMessage(message, "Tu correo todavía no está confirmado. Revisa tu bandeja de entrada y pulsa el enlace de confirmación.", "error");
        } else {
          showMessage(message, "El correo o la contraseña no son correctos.", "error");
        }
        return;
      }

      if (!data.user.email_confirmed_at) {
        showMessage(message, "Tu cuenta todavía no tiene el correo verificado. Revisa tu bandeja de entrada.", "error");
        await supabase.auth.signOut();
        return;
      }

      showMessage(message, "Sesión iniciada correctamente.", "success");
      setTimeout(() => redirectTo("perfil.html"), 500);
    });
  }

  async function recovery() {
    const form = document.querySelector("#recovery-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      const message = form.querySelector("[data-auth-message]");
      const email = form.querySelector("[name=email]").value.trim().toLowerCase();

      if (!email) {
        showMessage(message, "Introduce tu correo electrónico.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Enviando...";

      const redirectUrl = publicUrl("perfil.html");
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });

      button.disabled = false;
      button.textContent = "Enviar enlace";

      if (error) {
        console.error(error);
        showMessage(message, error.message, "error");
        return;
      }

      showMessage(message, "Si el correo existe, recibirás un enlace para restablecer la contraseña.", "success");
    });
  }

  async function profile() {
    const profilePage = document.querySelector("[data-profile-page]");
    if (!profilePage) return;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      window.location.href = "login.html";
      return;
    }

    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("name,country,avatar_url,created_at,updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      const status = document.querySelector("[data-profile-status]");
      if (status) status.textContent = "No se pudo cargar el perfil.";
      return;
    }

    const name = profileData?.name || user.user_metadata?.name || "Usuario";
    const country = profileData?.country || user.user_metadata?.country || "—";
    const created = profileData?.created_at || user.created_at;

    const set = (selector, value) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = value;
    };

    set("[data-profile-name]", name);
    set("[data-profile-country]", country);
    set("[data-profile-email]", user.email || "Privado");
    set("[data-profile-status]", user.email_confirmed_at ? "Correo verificado" : "Correo no verificado");
    set("[data-profile-date]", created ? new Date(created).toLocaleDateString("es-MX") : "—");
  }

  async function emailConfirmed() {
    const page = document.querySelector("[data-email-confirmed-page]");
    if (!page) return;

    // El cliente de Supabase procesa automáticamente el enlace de confirmación
    // gracias a detectSessionInUrl=true. Esperamos un instante para permitir
    // que el intercambio de la sesión termine antes de mostrar el resultado.
    let session = null;
    for (let i = 0; i < 10; i++) {
      const result = await supabase.auth.getSession();
      session = result.data?.session || null;
      if (session) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const status = document.querySelector("[data-email-confirmed-status]");
    const title = document.querySelector("[data-email-confirmed-title]");
    const button = document.querySelector("[data-email-confirmed-home]");

    if (session?.user?.email_confirmed_at) {
      if (title) title.textContent = "EMAIL CONFIRMADO";
      if (status) status.textContent = "Tu correo electrónico ha sido confirmado correctamente. Ya puedes entrar al inicio de EME GAMES con tu cuenta.";
    } else {
      if (title) title.textContent = "CONFIRMACIÓN COMPLETADA";
      if (status) status.textContent = "El enlace fue procesado. Si todavía no aparece una sesión, vuelve a iniciar sesión con tu correo y contraseña.";
    }

    if (button) {
      button.href = "../index.html";
    }
  }

  async function init() {
    await refreshAccountUI();
    await refreshDownloadUI();
    await register();
    await login();
    await recovery();
    await profile();
    await emailConfirmed();
  }

  document.addEventListener("eme:header-ready", () => {
    refreshAccountUI();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
