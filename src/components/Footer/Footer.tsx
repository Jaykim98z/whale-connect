import './Footer.css';

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="creator-section">
          <img src="/orangekim.svg" alt="제작자" className="creator-image" onError={e => (e.currentTarget.style.display = 'none')} />
          <div className="creator-info">
            <p className="creator-name">제작자: 김주황</p>
            <a
              href="https://www.sooplive.co.kr/station/kimjin7930"
              target="_blank"
              rel="noopener noreferrer"
              className="creator-contact"
            >
              sooplive.co.kr/station/kimjin7930
            </a>
          </div>
        </div>
        <div className="copyright-section">
          <p className="copyright-text">
            본 사이트는 김마렌의 올챙구가 고래상사에 선물한 프리웨어입니다.<br />
            사용된 이미지의 저작권은 김마렌에게 있으며, 무단 복제를 금합니다.<br />
            © 2026 고래사천성 · All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}
