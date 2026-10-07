import type { RefObject } from "react";
import type { Language } from "./reportStore";
import { JourneyProgress } from "./InvestorLanding";
import "./account.css";

type Props = {
  language: Language;
  busy: boolean;
  configured: boolean;
  hasPreview: boolean;
  localTesting: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onContinue: () => void;
  onBack: () => void;
  onTestWorkspace: () => void;
};

export function SignInView({
  language,
  busy,
  configured,
  hasPreview,
  localTesting,
  headingRef,
  onContinue,
  onBack,
  onTestWorkspace,
}: Props) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  return (
    <section className="signin-page">
      <div className="container">
        {hasPreview && <JourneyProgress language={language} current={3} />}
        <button className="text-button back" disabled={busy} onClick={onBack}>
          {hasPreview
            ? tr("← Back to your preview", "← Назад кон прегледот")
            : tr("← Back to start", "← Назад кон почеток")}
        </button>
        <div className="signin-grid">
          <div className="signin-copy">
            <span className="eyebrow">
              {tr("YOUR TAXCALCULATOR ACCOUNT", "ВАШАТА TAXCALCULATOR СМЕТКА")}
            </span>
            <h1 ref={headingRef} tabIndex={-1}>
              {tr(
                "Your report credits. One account.",
                "Вашите кредити. Една сметка.",
              )}
            </h1>
            <p className="signin-lead">
              {tr(
                "Sign in when you’re ready to buy or unlock a report. Your account keeps purchased credits available between visits and across devices.",
                "Најавете се кога ќе сте подготвени да купите или отклучите извештај. Сметката ги чува купените кредити меѓу посетите и на различни уреди.",
              )}
            </p>
            <div className="account-benefits">
              {[
                [
                  "01",
                  tr(
                    "Keep your credits together",
                    "Чувајте ги кредитите на едно место",
                  ),
                  tr(
                    "Buy 1, 2 or 3 reports and use the remaining credits whenever you return to your account.",
                    "Купете 1, 2 или 3 извештаи и користете ги преостанатите кредити кога ќе се вратите на сметката.",
                  ),
                ],
                [
                  "02",
                  tr(
                    "Continue where you left off",
                    "Продолжете од каде што застанавте",
                  ),
                  tr(
                    "Your selected CSV stays locally for up to 24 hours through sign-in and checkout. Review it before using a credit.",
                    "Избраниот CSV останува локално до 24 часа при најава и плаќање. Проверете го пред користење кредит.",
                  ),
                ],
                [
                  "03",
                  tr(
                    "Keep control of your statement",
                    "Задржете контрола врз изводот",
                  ),
                  tr(
                    "Your credits follow your account. Report files stay on this browser and device. Download Excel and your summary to keep copies.",
                    "Кредитите се поврзани со сметката. Датотеките остануваат во овој прелистувач и уред. Преземете Excel и резиме за да зачувате копии.",
                  ),
                ],
              ].map(([number, title, text]) => (
                <article key={number}>
                  <span aria-hidden="true">{number}</span>
                  <div>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="fine signin-free-note">
              {tr(
                "Just exploring? Samples, calculation explanations and CSV previews are free and don’t require an account.",
                "Само разгледувате? Примерите, објаснувањата и CSV прегледите се бесплатни и не бараат сметка.",
              )}
            </p>
          </div>
          <section
            className="panel signin-card"
            aria-labelledby="signin-card-title"
          >
            <span className="signin-envelope" aria-hidden="true">
              @
            </span>
            <h2 id="signin-card-title">
              {tr("Sign in with your email", "Најавете се со е-пошта")}
            </h2>
            <p>
              {tr(
                "Use your TaxCalculator account email. New accounts confirm their email address before signing in.",
                "Користете ја е-поштата на вашата TaxCalculator сметка. Новите сметки ја потврдуваат е-поштата пред најава.",
              )}
            </p>
            <button
              className="button primary full"
              disabled={busy || !configured}
              onClick={onContinue}
            >
              {tr("Continue with email", "Продолжи со е-пошта")} →
            </button>
            <p className="signin-next-screen">
              {tr(
                "On the next screen, sign in, create an account, or reset a forgotten password.",
                "На следниот екран можете да се најавите, да создадете сметка или да ресетирате заборавена лозинка.",
              )}
            </p>
            {configured ? (
              <p className="signin-security">
                {tr(
                  "You’ll continue to the secure account sign-in page. Your IBKR login is never required.",
                  "Ќе продолжите кон безбедниот екран за најава. Вашата IBKR најава не е потребна.",
                )}
              </p>
            ) : (
              <div className="signin-unavailable" role="status">
                <strong>
                  {tr(
                    "Account sign-in is not enabled here yet.",
                    "Најавата на сметки сè уште не е овозможена тука.",
                  )}
                </strong>
                <p>
                  {tr(
                    "You can still explore the sample, calculation guide and free statement preview. The site operator must connect the account service before real purchases are available.",
                    "Можете да го разгледате примерот, методот и бесплатниот преглед. Операторот треба да го поврзе сервисот за сметки пред вистински купувања.",
                  )}
                </p>
              </div>
            )}
            {hasPreview && (
              <p className="signin-draft-note">
                {tr(
                  "Your statement is kept on this browser while you sign in. You’ll return to your preview before paying.",
                  "Изводот останува во овој прелистувач додека се најавувате. Ќе се вратите во прегледот пред плаќање.",
                )}
              </p>
            )}
            {localTesting && (
              <div className="signin-test-access">
                <span>
                  {tr(
                    "Testing this installation?",
                    "Ја тестирате оваа инсталација?",
                  )}
                </span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={onTestWorkspace}
                >
                  {tr("Open local test workspace", "Отвори локално тестирање")}{" "}
                  →
                </button>
                <small>
                  {tr(
                    "Test credits use this browser’s test key; they are separate from a signed-in account.",
                    "Тест кредитите користат тест клуч во прелистувачот и се одделни од најавена сметка.",
                  )}
                </small>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
