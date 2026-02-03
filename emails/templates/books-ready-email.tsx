import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Font,
} from '@react-email/components'

interface BooksReadyEmailProps {
  customerName: string
  childName?: string
  childrenNames: string
  storyName?: string
  booksList: Array<{ childName: string; storyName: string }>
  approvalUrl: string
  isSingleBook: boolean
}

// Logo URL - hosted on the website
const LOGO_URL = 'https://prikazko.bg/wp-content/uploads/2025/10/logo-canva-remove-bg-300x300.png'

export function BooksReadyEmail({
  customerName = 'Клиент',
  childName = 'Детето',
  childrenNames = 'децата',
  storyName = 'Приказка',
  booksList = [],
  approvalUrl = 'https://prikazko.bg',
  isSingleBook = true,
}: BooksReadyEmailProps) {
  const previewText = isSingleBook
    ? `${childName} е главният герой! Вижте персоналната книжка преди печат`
    : `Книжките за ${childrenNames} са готови за преглед!`

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Nunito"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTI9jo7eTWk.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Nunito"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTI9jo7eTWk.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with logo */}
          <Section style={header}>
            <Img
              src={LOGO_URL}
              width="100"
              height="100"
              alt="Приказко"
              style={logo}
            />
            <Heading style={logoText}>Приказко</Heading>
            <Text style={tagline}>Персонализирани детски книжки</Text>
          </Section>

          {/* Main content */}
          <Section style={content}>
            {/* Greeting */}
            <Heading style={greeting}>
              Здравейте, {customerName}! ✨
            </Heading>

            {/* Main message */}
            {isSingleBook ? (
              <>
                <Text style={paragraph}>
                  Имаме вълнуващи новини – персонализираната книжка за{' '}
                  <strong style={highlight}>{childName}</strong> е готова!
                </Text>
                <Section style={storyBox}>
                  <Text style={storyTitle}>{storyName}</Text>
                </Section>
                <Text style={paragraph}>
                  Вложихме много любов и внимание, за да създадем тази уникална
                  история, в която <strong style={highlight}>{childName}</strong> е истинският
                  герой. Сега е моментът да я видите!
                </Text>
              </>
            ) : (
              <>
                <Text style={paragraph}>
                  Имаме страхотни новини – персонализираните книжки за{' '}
                  <strong style={highlight}>{childrenNames}</strong> са готови!
                </Text>
                <Section style={booksListBox}>
                  <Text style={booksListTitle}>📚 Книжки за вашите малчугани:</Text>
                  {booksList.map((book, index) => (
                    <Text key={index} style={bookItem}>
                      • <strong>{book.childName}</strong> – „{book.storyName}“
                    </Text>
                  ))}
                </Section>
                <Text style={paragraph}>
                  Всяка история е създадена с много внимание и любов, за да
                  превърне <strong style={highlight}>{childrenNames}</strong> в истински герои.
                  Сега е моментът да ги видите!
                </Text>
              </>
            )}

            <Hr style={divider} />

            {/* Steps */}
            <Heading as="h2" style={sectionTitle}>
              📖 Какво да направите сега
            </Heading>

            <Section style={stepsContainer}>
              <table style={stepsTable}>
                <tbody>
                  <tr>
                    <td style={stepNumberCell}>
                      <span style={stepNumber}>1</span>
                    </td>
                    <td style={stepTextCell}>Натиснете бутона по-долу</td>
                  </tr>
                  <tr>
                    <td style={stepNumberCell}>
                      <span style={stepNumber}>2</span>
                    </td>
                    <td style={stepTextCell}>
                      Разгледайте {isSingleBook ? 'всяка страница от книжката' : 'внимателно всяка книжка'}
                    </td>
                  </tr>
                  <tr>
                    <td style={stepNumberCell}>
                      <span style={stepNumber}>3</span>
                    </td>
                    <td style={stepTextCell}>
                      Натиснете „Одобри и изпрати за печат" или „Откажи"
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href={approvalUrl}>
                👉 {isSingleBook ? 'Преглед на книжката' : 'Преглед на книжките'}
              </Button>
            </Section>

            <Hr style={divider} />

            {/* Urgency notice */}
            <Section style={noticeBox}>
              <Text style={noticeText}>
                ⏰ Моля, прегледайте {isSingleBook ? 'книжката' : 'книжките'} в рамките на{' '}
                <strong>48 часа</strong>, за да можем да{' '}
                {isSingleBook ? 'я' : 'ги'} изпратим за печат възможно най-скоро.
              </Text>
            </Section>

            {/* Tip */}
            <Section style={tipBox}>
              <Text style={tipText}>
                💡 <strong>Малък съвет:</strong> Прегледайте заедно с{' '}
                {isSingleBook ? childName : childrenNames} – децата обичат да се
                виждат {isSingleBook ? 'в собствената си история' : 'като главни герои в собствените си истории'}!
              </Text>
            </Section>

            {/* Support */}
            <Text style={supportText}>
              Ако имате въпроси, просто отговорете на този имейл – винаги сме насреща.
            </Text>

            {/* Sign off */}
            <Text style={signOff}>
              С топли пожелания и очакване на вашето одобрение,
              <br />
              <strong>Екипът на Приказко</strong> 📖✨
            </Text>

            {/* PS */}
            <Text style={ps}>
              П.С.{' '}
              {isSingleBook
                ? `Не можем да се сдържим да споделим – ${childName} изглежда невероятно в тази история! 💛`
                : `Едва чакаме да видите колко невероятно изглеждат ${childrenNames} в техните истории! 💛`}
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Img
              src={LOGO_URL}
              width="48"
              height="48"
              alt="Приказко"
              style={footerLogo}
            />
            <Text style={footerText}>
              © {new Date().getFullYear()} Приказко. Всички права запазени.
            </Text>
            <Text style={footerLinks}>
              <Link href="https://prikazko.bg" style={footerLink}>
                prikazko.bg
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default BooksReadyEmail

// Brand Colors
const colors = {
  brandMain: '#A46BE3',
  brandAccent: '#C78BFF',
  brandInk: '#1F2937',
  brandMuted: '#6B7280',
  brandLightPurple: '#f3e8ff',
  brandSoftPurple: '#F5F3FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  white: '#FFFFFF',
  warmBg: '#FFFBF7',
}

// Styles
const main = {
  backgroundColor: colors.warmBg,
  fontFamily: '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0',
  maxWidth: '600px',
}

const header = {
  backgroundColor: colors.brandLightPurple,
  padding: '32px 40px',
  textAlign: 'center' as const,
  borderRadius: '16px 16px 0 0',
}

const logo = {
  margin: '0 auto 12px auto',
  borderRadius: '16px',
}

const logoText = {
  color: colors.brandMain,
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '0.5px',
}

const tagline = {
  color: colors.brandMuted,
  fontSize: '14px',
  margin: '8px 0 0 0',
  fontWeight: '400',
}

const content = {
  backgroundColor: colors.white,
  padding: '40px',
}

const greeting = {
  color: colors.brandInk,
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 24px 0',
}

const paragraph = {
  color: colors.brandInk,
  fontSize: '16px',
  lineHeight: '28px',
  margin: '0 0 20px 0',
}

const highlight = {
  color: colors.brandMain,
}

const storyBox = {
  backgroundColor: colors.brandLightPurple,
  borderLeft: `4px solid ${colors.brandMain}`,
  padding: '16px 20px',
  margin: '24px 0',
  borderRadius: '0 12px 12px 0',
}

const storyTitle = {
  color: colors.brandMain,
  fontSize: '20px',
  fontWeight: '700',
  margin: '0',
  fontStyle: 'italic' as const,
}

const booksListBox = {
  backgroundColor: colors.brandSoftPurple,
  padding: '20px 24px',
  margin: '24px 0',
  borderRadius: '12px',
  border: `1px solid ${colors.brandLightPurple}`,
}

const booksListTitle = {
  color: colors.brandMain,
  fontSize: '16px',
  fontWeight: '700',
  margin: '0 0 16px 0',
}

const bookItem = {
  color: colors.brandInk,
  fontSize: '15px',
  lineHeight: '26px',
  margin: '8px 0',
}

const divider = {
  borderColor: '#E5E7EB',
  margin: '32px 0',
}

const sectionTitle = {
  color: colors.brandInk,
  fontSize: '18px',
  fontWeight: '700',
  margin: '0 0 20px 0',
}

const stepsContainer = {
  margin: '0 0 24px 0',
}

const stepsTable = {
  width: '100%',
  borderCollapse: 'collapse' as const,
}

const stepNumberCell = {
  width: '44px',
  verticalAlign: 'top' as const,
  paddingTop: '4px',
  paddingBottom: '16px',
}

const stepTextCell = {
  color: colors.brandInk,
  fontSize: '15px',
  lineHeight: '24px',
  verticalAlign: 'top' as const,
  paddingTop: '6px',
  paddingBottom: '16px',
}

const stepNumber = {
  backgroundColor: colors.brandMain,
  color: colors.white,
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'inline-block',
  textAlign: 'center' as const,
  lineHeight: '32px',
  fontSize: '14px',
  fontWeight: '700',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: colors.brandMain,
  borderRadius: '12px',
  color: colors.white,
  fontSize: '18px',
  fontWeight: '700',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 40px',
  boxShadow: '0 4px 12px rgba(164, 107, 227, 0.35)',
}

const noticeBox = {
  backgroundColor: '#FEF2F2',
  border: '1px solid #FECACA',
  padding: '16px 20px',
  borderRadius: '12px',
  margin: '24px 0',
}

const noticeText = {
  color: '#991B1B',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}

const tipBox = {
  backgroundColor: '#ECFDF5',
  border: '1px solid #A7F3D0',
  padding: '16px 20px',
  borderRadius: '12px',
  margin: '24px 0',
}

const tipText = {
  color: '#065F46',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}

const supportText = {
  color: colors.brandMuted,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '24px 0',
}

const signOff = {
  color: colors.brandInk,
  fontSize: '15px',
  lineHeight: '26px',
  margin: '24px 0 16px 0',
}

const ps = {
  color: colors.brandMuted,
  fontSize: '14px',
  lineHeight: '22px',
  fontStyle: 'italic' as const,
  margin: '0',
}

const footer = {
  backgroundColor: colors.brandSoftPurple,
  padding: '24px 40px',
  textAlign: 'center' as const,
  borderRadius: '0 0 16px 16px',
}

const footerLogo = {
  margin: '0 auto 12px auto',
  borderRadius: '8px',
}

const footerText = {
  color: colors.brandMuted,
  fontSize: '12px',
  margin: '0 0 8px 0',
}

const footerLinks = {
  margin: '0',
}

const footerLink = {
  color: colors.brandMain,
  fontSize: '12px',
  textDecoration: 'none',
  fontWeight: '600',
}
