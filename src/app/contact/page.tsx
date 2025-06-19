export default function ContactPage() {
    return (
      <main className="p-8 max-w-md mx-auto">
        <h1 className="text-3xl font-semibold mb-6">Contact Me</h1>
        <form
          name="contact"
          method="POST"
          data-netlify="true"
          className="flex flex-col space-y-4"
        >
          <input type="hidden" name="form-name" value="contact" />
          <label>
            Name
            <input
              type="text"
              name="name"
              className="mt-1 p-2 border rounded w-full"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              className="mt-1 p-2 border rounded w-full"
            />
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={5}
              className="mt-1 p-2 border rounded w-full"
            />
          </label>
          <button
            type="submit"
            className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Send
          </button>
        </form>
      </main>
    );
  }
  